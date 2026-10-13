import { safeFetch, readCapped, readTextCapped } from "../net.js";
import { HttpError } from "../safety.js";
import { classify, containerFromUrl, linkExpiry, reasonForStatus, sniff } from "./inspect.js";
import { probeDash } from "./dash.js";
import { isPackedAudio, mp4Tracks, tsTracks } from "./tracks.js";
import { parseChannelList } from "./streams.js";

export { classify };

const TIMEOUT_MS = 12_000;
const MAX_PLAYLIST_BYTES = 5 * 1024 * 1024;
// Files smaller than this are almost always ads, previews or trailers.
const MIN_MOVIE_BYTES = 8 * 1024 * 1024;

export function headersFor(referer) {
  let origin = null;
  try {
    origin = referer ? new URL(referer).origin : null;
  } catch {
    /* ignore a broken referer */
  }
  return { Accept: "*/*", ...(origin ? { Referer: referer, Origin: origin } : {}) };
}

/** A candidate that didn't turn into a source, and why (used to explain empty results). */
export class Rejection extends Error {
  constructor(reason, message, extra = {}) {
    super(message);
    this.reason = reason;
    Object.assign(this, extra);
  }
}

/**
 * Turns raw candidate URLs into downloadable/playable sources.
 * Returns { sources, rejected: [{ url, reason, status, observedStatus }] }.
 */
export async function probeCandidates(candidates) {
  const rejected = [];
  const results = await Promise.all(
    candidates.map((c) =>
      probeOne(c)
        .then((list) => list.map((s) => ({ ...s, hint: s.hint ?? c.hint, frameHint: c.frameHint })))
        .catch((err) => {
        rejected.push({
          url: c.url,
          reason: err.reason || "error",
          status: err.httpStatus ?? null,
          observedStatus: c.observedStatus ?? null,
        });
        return [];
      }),
    ),
  );
  let sources = results.flat().filter(Boolean);

  // Files that are really pieces of a stream (fMP4 segments, byte-range "main.mp4" files)
  // are not standalone downloads: they are usually video-only or audio-only.
  const parts = new Set(sources.flatMap((s) => s._parts ?? []));
  sources = sources.filter((s) => s.type !== "file" || !parts.has(stripQuery(s.url)));

  // Players often load video and audio as two separate quality playlists. Pair a video-only
  // playlist with the audio one so the download has sound; never list audio-only streams as
  // video choices; and say so when no sound track exists at all.
  const audioOnly = sources.filter((s) => s.type === "hls" && s.tracks && s.tracks.audio && !s.tracks.video);
  const videoOnly = sources.filter((s) => s.type === "hls" && !s.fromMaster && !s.audioUrl && s.tracks?.video && !s.tracks.audio);
  for (const v of videoOnly) {
    if (audioOnly.length) v.audioUrl = audioOnly[0].url;
    else v.noAudio = true;
  }
  if (sources.some((s) => !audioOnly.includes(s))) sources = sources.filter((s) => !audioOnly.includes(s));
  else sources.forEach((s) => Object.assign(s, { quality: "Audio", label: "Audio only" }));

  // A master playlist already lists its variants; drop the duplicates captured separately.
  const variantUrls = new Set(sources.filter((s) => s.fromMaster).map((s) => s.url));
  sources = sources.filter(
    (s, i, all) => all.findIndex((o) => o.url === s.url && o.type === s.type && (o.videoRep ?? null) === (s.videoRep ?? null)) === i,
  );
  // Same file served from mirrors: same type and exact byte size.
  sources = sources.filter((s, i, all) => s.type !== "file" || !s.size || all.findIndex((o) => o.type === s.type && o.size === s.size) === i);
  sources = sources.filter((s) => s.fromMaster || !variantUrls.has(s.url));

  const movieSized = sources.filter((s) => s.type !== "file" || !s.size || s.size >= MIN_MOVIE_BYTES);
  if (movieSized.length) sources = movieSized;

  sources = sources
    .sort(
      (a, b) =>
        Number(b.downloadable !== false) - Number(a.downloadable !== false) ||
        Number(!b.noAudio) - Number(!a.noAudio) ||
        (b.height || 0) - (a.height || 0) ||
        (b.size || 0) - (a.size || 0),
    )
    .map((s, i) => ({ ...s, id: `${s.type}-${s.quality}-${i}` }));
  return { sources, rejected };
}

async function probeOne({ url, referer, type, contentType }) {
  const kind = type || classify(url, contentType);
  if (kind === "hls") return probeHls(url, referer, 0);
  if (kind === "dash") return probeDash(url, referer);
  if (kind === "file") return [await probeFile(url, referer)];
  throw new Rejection("not_media", "Not a video link");
}

/** GET through the SSRF-safe client; throws a Rejection for network and HTTP errors. */
export async function fetchMedia(url, referer, extraHeaders = {}) {
  let res;
  try {
    res = await safeFetch(url, { headers: { ...headersFor(referer), ...extraHeaders }, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    if (err instanceof HttpError && err.status === 400) throw new Rejection("blocked", err.message);
    throw new Rejection(err.name === "TimeoutError" ? "timeout" : "unreachable", err.message);
  }
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    throw new Rejection(reasonForStatus(res.status), `HTTP ${res.status}`, { httpStatus: res.status });
  }
  return res;
}

async function probeFile(url, referer) {
  // A small range: works on servers that reject HEAD, returns the full size, and lets us
  // check the first bytes really are a video (not an error page served with a 200).
  const res = await fetchMedia(url, referer, { Range: "bytes=0-4095" });
  const contentType = res.headers.get("content-type") || "";
  const head = await readCapped(res, 4096);
  const sniffed = sniff(head, contentType);
  if (sniffed.kind === "hls") return (await probeHls(res.url, referer))[0];
  if (sniffed.kind === "dash") return (await probeDash(res.url, referer))[0];
  if (sniffed.kind !== "file") {
    // Some CDNs label videos application/octet-stream and start with bytes we don't recognise.
    const generic = /octet-stream|binary/.test(contentType) && sniffed.kind === null;
    if (!generic) throw new Rejection("not_media", "Not a video");
  }
  const size =
    Number(res.headers.get("content-range")?.split("/")[1]) || (res.status === 200 ? Number(res.headers.get("content-length")) : 0) || null;
  const finalUrl = res.url || url;
  const height = Number(finalUrl.match(/(?:^|[^\d])(2160|1440|1080|720|576|480|360|240)p?(?:[^\d]|$)/)?.[1]) || null;
  const container = sniffed.container || containerFromUrl(finalUrl) || "mp4";
  const { temporary, expiresAt } = linkExpiry(finalUrl);
  return source({
    url: finalUrl,
    referer,
    type: "file",
    container,
    height,
    size,
    temporary,
    expiresAt,
    resumable: res.status === 206,
  });
}

async function fetchText(url, referer) {
  const res = await fetchMedia(url, referer);
  const text = await readTextCapped(res, MAX_PLAYLIST_BYTES, "That playlist is too large.");
  return { text: text.replace(/^﻿/, ""), finalUrl: res.url || url };
}

// A playlist of channels: probe each one (a few at a time) and keep the ones that answer.
const MAX_CHANNELS = 16;
async function probeChannels(channels, referer) {
  const queue = channels.slice(0, MAX_CHANNELS * 2);
  const found = [];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length && found.length < MAX_CHANNELS) {
      const ch = queue.shift();
      const list = await probeHls(ch.url, referer, 1).catch(() => []);
      if (list.length) found.push(...list.map((s) => ({ ...s, hint: ch.name || s.hint })));
    }
  });
  await Promise.all(workers);
  return found;
}

async function probeHls(url, referer, depth = 0) {
  const { text, finalUrl } = await fetchText(url, referer);
  if (!text.startsWith("#EXTM3U")) throw new Rejection("not_media", "Not a playlist");
  if (depth === 0) {
    const channels = parseChannelList(text, finalUrl);
    if (channels.length >= 2) return probeChannels(channels, referer);
  }
  const { temporary, expiresAt } = linkExpiry(finalUrl);

  if (!text.includes("#EXT-X-STREAM-INF")) {
    const info = readMediaPlaylist(text);
    // A standalone quality playlist: check whether it carries video, audio or both, so a
    // video-only one can be paired with the player's separate audio playlist later.
    const tracks = await playlistTracks(text, finalUrl, referer).catch(() => null);
    return [
      source({
        url: finalUrl,
        referer,
        type: "hls",
        ...(tracks?.height ? { height: tracks.height } : { quality: "Auto" }),
        tracks,
        _parts: partUrls(text, finalUrl),
        temporary,
        expiresAt,
        ...info,
        ...blockFor(info),
      }),
    ];
  }

  // Master playlist: one source per quality.
  const variants = [];
  const lines = text.split(/\r?\n/);

  // Audio tracks served separately from the video (EXT-X-MEDIA with its own URI).
  const audioGroups = new Map();
  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA:") || !/TYPE=AUDIO/.test(line)) continue;
    const group = line.match(/GROUP-ID="([^"]+)"/)?.[1];
    const uri = line.match(/URI="([^"]+)"/)?.[1];
    if (group && uri && (!audioGroups.has(group) || /DEFAULT=YES/.test(line))) {
      audioGroups.set(group, new URL(uri, finalUrl).href);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const attrs = lines[i];
    const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#"));
    if (!uri) continue;
    variants.push({
      url: new URL(uri.trim(), finalUrl).href,
      height: Number(attrs.match(/RESOLUTION=\d+x(\d+)/)?.[1]) || null,
      bandwidth: Number(attrs.match(/[^-]BANDWIDTH=(\d+)/)?.[1]) || null,
      codecs: attrs.match(/CODECS="([^"]+)"/)?.[1] || null,
      audioUrl: audioGroups.get(attrs.match(/AUDIO="([^"]+)"/)?.[1]) || null,
    });
  }
  // Audio-only entries (no resolution, only an audio codec) aren't a video quality.
  const isAudioOnly = (v) => !v.height && v.codecs && !/avc|hvc|hev|vp0?[89]|av01|mp4v/i.test(v.codecs);
  if (variants.some((v) => !isAudioOnly(v))) variants.splice(0, variants.length, ...variants.filter((v) => !isAudioOnly(v)));
  if (!variants.length) throw new Rejection("not_media", "Empty master playlist");

  // Masters often repeat each resolution once per audio codec (AAC, AC-3, E-AC-3). Keep one
  // per resolution, preferring AAC (plays everywhere), then the highest bitrate.
  const aacFirst = (v) => (!v.codecs || /mp4a/i.test(v.codecs) ? 1 : 0);
  const byHeight = new Map();
  for (const v of variants) {
    const key = v.height ?? `bw${v.bandwidth}`;
    const best = byHeight.get(key);
    if (!best || aacFirst(v) > aacFirst(best) || (aacFirst(v) === aacFirst(best) && (v.bandwidth || 0) > (best.bandwidth || 0))) byHeight.set(key, v);
  }
  variants.splice(0, variants.length, ...byHeight.values());

  // Read the best variant once for duration / live / encryption; all variants share these.
  variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));
  // A master whose quality playlists can't be read is a dead stream, not a source.
  let info = null;
  let masterParts = [];
  let lastError = null;
  for (const v of variants.slice(0, 3)) {
    try {
      const media = await fetchText(v.url, referer);
      masterParts = partUrls(media.text, media.finalUrl);
      if (!media.text.startsWith("#EXTM3U")) throw new Rejection("not_media", "Variant is not a playlist");
      const mediaInfo = readMediaPlaylist(media.text);
      info = { ...mediaInfo, drm: detectDrm(text) || mediaInfo.drm };
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!info) throw lastError instanceof Rejection ? lastError : new Rejection("unreachable", "Stream playlists unreachable");
  const block = blockFor(info);

  return variants.map((v) =>
    source({
      url: v.url,
      referer,
      type: "hls",
      height: v.height,
      bandwidth: v.bandwidth,
      codecs: v.codecs,
      audioUrl: v.audioUrl,
      size: !info.live && info.duration && v.bandwidth ? Math.round((v.bandwidth * info.duration) / 8) : null,
      sizeEstimated: true,
      masterUrl: finalUrl,
      _parts: masterParts,
      fromMaster: true,
      temporary,
      expiresAt,
      ...info,
      ...block,
    }),
  );
}

function readMediaPlaylist(text) {
  const duration = [...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  const method = text.match(/#EXT-X-KEY:[^\n]*METHOD=([A-Z0-9-]+)/)?.[1] || null;
  return {
    duration: duration || null,
    live: !text.includes("#EXT-X-ENDLIST") && !/#EXT-X-PLAYLIST-TYPE:VOD/.test(text),
    drm: detectDrm(text),
    encryption: method && method !== "NONE" ? method : null,
  };
}

// Why an HLS source can't be saved (watching may still work), or nothing.
function blockFor(info) {
  if (info.drm) return { downloadable: false, blockReason: "This stream is DRM-protected, so it can't be downloaded." };
  if (info.live) return { downloadable: false, blockReason: "Live streams can be watched, not downloaded." };
  if (info.encryption && info.encryption !== "AES-128") {
    return { downloadable: false, blockReason: `This stream uses ${info.encryption} encryption, which only the site's own player can play.` };
  }
  return { downloadable: true };
}

// AES-128 is plain encryption a downloader can handle with the published key; SAMPLE-AES with
// Widevine/FairPlay/PlayReady, or CENC (SAMPLE-AES-CTR), is DRM that needs a licence server.
function detectDrm(text) {
  return (
    (/METHOD=SAMPLE-AES/i.test(text) &&
      /KEYFORMAT="(com\.apple\.streamingkeydelivery|urn:uuid:edef8ba9|com\.microsoft\.playready|urn:uuid:9a04f079)/i.test(text)) ||
    /METHOD=(SAMPLE-AES-CTR|ISO-23001-7)/i.test(text) ||
    /urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i.test(text) ||
    /#EXT-X-SESSION-KEY:[^\n]*KEYFORMAT="(com\.apple\.streamingkeydelivery|urn:uuid:)/i.test(text)
  );
}

export function qualityOf(height) {
  if (!height) return { quality: "Original", label: "Best available" };
  if (height >= 2160) return { quality: "4K", label: "Ultra HD" };
  if (height >= 1440) return { quality: "1440p", label: "Quad HD" };
  if (height >= 1080) return { quality: "1080p", label: "Full HD" };
  if (height >= 720) return { quality: "720p", label: "HD" };
  return { quality: `${height}p`, label: "SD" };
}

export function source({ quality, ...rest }) {
  const q = quality ? { quality, label: quality === "Auto" ? "Adaptive" : quality } : qualityOf(rest.height);
  return { height: null, size: null, duration: null, live: false, drm: false, downloadable: true, ...rest, ...q };
}

/* ---------- what a standalone playlist contains ---------- */

const stripQuery = (u) => String(u).split(/[?#]/)[0];

/** Segment and init (EXT-X-MAP) addresses of a media playlist, without query strings. */
function partUrls(text, baseUrl) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    try {
      if (line && !line.startsWith("#")) out.push(stripQuery(new URL(line, baseUrl).href));
      const map = line.startsWith("#EXT-X-MAP:") && line.match(/URI="([^"]+)"/)?.[1];
      if (map) out.push(stripQuery(new URL(map, baseUrl).href));
    } catch {
      /* skip a broken line */
    }
  }
  return out;
}

/**
 * Reads the start of a media playlist's first piece (or its init segment) and returns
 * { video, audio, height } — or null when it can't tell.
 */
async function playlistTracks(text, baseUrl, referer) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const mapLine = lines.find((l) => l.startsWith("#EXT-X-MAP:"));
  const firstSeg = lines.find((l) => l && !l.startsWith("#"));
  if (!firstSeg && !mapLine) return null;

  if (mapLine) {
    const uri = new URL(mapLine.match(/URI="([^"]+)"/)[1], baseUrl).href;
    const br = mapLine.match(/BYTERANGE="(\d+)(?:@(\d+))?"/);
    const range = br ? `bytes=${Number(br[2] || 0)}-${Number(br[2] || 0) + Number(br[1]) - 1}` : "bytes=0-262143";
    const res = await fetchMedia(uri, referer, { Range: range });
    return mp4Tracks(await readCapped(res, 262_144));
  }

  const segUrl = new URL(firstSeg, baseUrl).href;
  const idx = lines.indexOf(firstSeg);
  const br = lines.slice(0, idx).reverse().find((l) => l.startsWith("#EXT-X-BYTERANGE:"))?.match(/:(\d+)(?:@(\d+))?/);
  const start = br ? Number(br[2] || 0) : 0;
  const res = await fetchMedia(segUrl, referer, { Range: `bytes=${start}-${start + 188 * 400 - 1}` });
  const head = await readCapped(res, 188 * 400);
  if (head[0] === 0x47) return tsTracks(head);
  if (isPackedAudio(head, segUrl)) return { video: false, audio: true, height: null };
  return mp4Tracks(head); // a self-contained fMP4 piece with its own header
}

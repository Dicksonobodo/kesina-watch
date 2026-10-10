import { USER_AGENT } from "../config.js";
import { isPrivateHostname } from "../safety.js";

const TIMEOUT_MS = 10_000;
// Files smaller than this are almost always ads, previews or trailers.
const MIN_MOVIE_BYTES = 8 * 1024 * 1024;

function headersFor(referer) {
  return {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
    ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
  };
}

export function classify(url, contentType = "") {
  const ct = contentType.toLowerCase();
  if (ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(url)) return "hls";
  if (ct.includes("dash+xml") || /\.mpd(\?|$)/i.test(url)) return "dash";
  if (ct === "video/mp2t" || /\.(ts|m4s)(\?|$)/i.test(url)) return null; // stream chunks, not a source
  if (ct.startsWith("video/") || /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url)) return "file";
  return null;
}

/** Turns raw candidate URLs into downloadable/playable sources. */
export async function probeCandidates(candidates) {
  const results = await Promise.all(candidates.map((c) => probeOne(c).catch(() => [])));
  let sources = results.flat();

  // A master playlist already lists its variants; drop the duplicates captured separately.
  const variantUrls = new Set(sources.filter((s) => s.fromMaster).map((s) => s.url));
  sources = sources.filter((s, i, all) => all.findIndex((o) => o.url === s.url) === i);
  // Same file served from mirrors: same type and exact byte size.
  sources = sources.filter(
    (s, i, all) => !s.size || all.findIndex((o) => o.type === s.type && o.size === s.size) === i,
  );
  sources = sources.filter((s) => s.fromMaster || !variantUrls.has(s.url));

  const movieSized = sources.filter((s) => s.type !== "file" || !s.size || s.size >= MIN_MOVIE_BYTES);
  if (movieSized.length) sources = movieSized;

  return sources
    .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.size || 0) - (a.size || 0))
    .map((s, i) => ({ ...s, id: `${s.quality}-${i}` }));
}

async function probeOne({ url, referer, type, size }) {
  if (isPrivateHostname(new URL(url).hostname)) return [];
  const kind = type || classify(url);
  if (kind === "hls") return probeHls(url, referer);
  if (kind === "dash") return [source({ url, referer, type: "dash", quality: "Auto" })];
  if (kind === "file") return [await probeFile(url, referer, size)];
  return [];
}

async function probeFile(url, referer, knownSize) {
  let size = knownSize || null;
  let contentType = "";
  if (!size) {
    // Range request: works on servers that reject HEAD, and returns the full size.
    const res = await fetch(url, {
      headers: { ...headersFor(referer), Range: "bytes=0-0" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    contentType = res.headers.get("content-type") || "";
    size =
      Number(res.headers.get("content-range")?.split("/")[1]) || Number(res.headers.get("content-length")) || null;
    res.body?.cancel().catch(() => {});
    if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
    if (contentType && !contentType.startsWith("video/") && !contentType.includes("octet-stream")) {
      throw new Error("Not a video");
    }
  }
  const height = Number(url.match(/(?:^|[^\d])(2160|1440|1080|720|576|480|360|240)p?(?:[^\d]|$)/)?.[1]) || null;
  const ext = url.match(/\.(mp4|webm|mov|mkv)(\?|$)/i)?.[1]?.toLowerCase() || "mp4";
  return source({ url, referer, type: "file", container: ext, height, size });
}

async function fetchText(url, referer) {
  const res = await fetch(url, { headers: headersFor(referer), redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { text: await res.text(), finalUrl: res.url || url };
}

async function probeHls(url, referer) {
  const { text, finalUrl } = await fetchText(url, referer);
  if (!text.startsWith("#EXTM3U")) return [];

  if (!text.includes("#EXT-X-STREAM-INF")) {
    const info = readMediaPlaylist(text);
    return [source({ url: finalUrl, referer, type: "hls", quality: "Auto", ...info })];
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
    const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
    if (!uri) continue;
    variants.push({
      url: new URL(uri, finalUrl).href,
      height: Number(attrs.match(/RESOLUTION=\d+x(\d+)/)?.[1]) || null,
      bandwidth: Number(attrs.match(/[^-]BANDWIDTH=(\d+)/)?.[1]) || null,
      audioUrl: audioGroups.get(attrs.match(/AUDIO="([^"]+)"/)?.[1]) || null,
    });
  }
  if (!variants.length) return [];

  // Read the best variant once for duration / live / DRM; all variants share these.
  variants.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0));
  let info = { duration: null, live: false, drm: detectDrm(text) };
  try {
    const media = await fetchText(variants[0].url, referer);
    const mediaInfo = readMediaPlaylist(media.text);
    info = { ...mediaInfo, drm: info.drm || mediaInfo.drm };
  } catch {
    /* keep what we know */
  }

  return variants.map((v) =>
    source({
      url: v.url,
      referer,
      type: "hls",
      height: v.height,
      audioUrl: v.audioUrl,
      size: !info.live && info.duration && v.bandwidth ? Math.round((v.bandwidth * info.duration) / 8) : null,
      masterUrl: finalUrl,
      fromMaster: true,
      ...info,
    }),
  );
}

function readMediaPlaylist(text) {
  const duration = [...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce((sum, m) => sum + Number(m[1]), 0);
  return {
    duration: duration || null,
    live: !text.includes("#EXT-X-ENDLIST") && !/#EXT-X-PLAYLIST-TYPE:VOD/.test(text),
    drm: detectDrm(text),
  };
}

// AES-128 is normal encryption players handle; SAMPLE-AES with Widevine/FairPlay/PlayReady is DRM.
function detectDrm(text) {
  return (
    /METHOD=SAMPLE-AES/i.test(text) &&
    /KEYFORMAT="(com\.apple\.streamingkeydelivery|urn:uuid:edef8ba9|com\.microsoft\.playready|urn:uuid:9a04f079)/i.test(text)
  ) || /urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed/i.test(text);
}

function qualityOf(height) {
  if (!height) return { quality: "Original", label: "Best available" };
  if (height >= 2160) return { quality: "4K", label: "Ultra HD" };
  if (height >= 1440) return { quality: "1440p", label: "Quad HD" };
  if (height >= 1080) return { quality: "1080p", label: "Full HD" };
  if (height >= 720) return { quality: "720p", label: "HD" };
  return { quality: `${height}p`, label: "SD" };
}

function source({ quality, ...rest }) {
  const q = quality ? { quality, label: quality === "Auto" ? "Adaptive" : quality } : qualityOf(rest.height);
  return { height: null, size: null, duration: null, live: false, drm: false, ...rest, ...q };
}

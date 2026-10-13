import * as cheerio from "cheerio";
import { readTextCapped } from "../net.js";
import { linkExpiry } from "./inspect.js";

/*
 * MPEG-DASH (.mpd) manifests: reads the qualities, duration, live/DRM status and whether
 * the browser download engine can save it (single period, fragmented MP4, standard
 * SegmentTemplate / SegmentList / SegmentBase addressing). Segment lists are resolved
 * later by the download engine in the browser.
 */

const MAX_MPD_BYTES = 8 * 1024 * 1024;

export function isoSeconds(iso) {
  const m = String(iso || "").match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (!m) return null;
  const s = Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0);
  return s || null;
}

export async function probeDash(url, referer) {
  // Imported lazily to avoid a circular import with media.js.
  const { fetchMedia, source, Rejection } = await import("./media.js");
  const res = await fetchMedia(url, referer);
  const text = await readTextCapped(res, MAX_MPD_BYTES, "That manifest is too large.");
  const finalUrl = res.url || url;
  if (!/<(\w+:)?MPD[\s>]/.test(text)) throw new Rejection("not_media", "Not a DASH manifest");
  const summary = summarizeMpd(text);
  const { temporary, expiresAt } = linkExpiry(finalUrl);

  if (!summary.video.length) {
    throw new Rejection("unsupported", "No video in manifest");
  }
  return summary.video.map((v) =>
    source({
      url: finalUrl,
      referer,
      type: "dash",
      container: summary.container,
      height: v.height,
      bandwidth: v.bandwidth,
      codecs: v.codecs,
      videoRep: v.id,
      audioRep: summary.audio?.id ?? null,
      hasAudio: Boolean(summary.audio),
      noAudio: !summary.audio,
      duration: summary.duration,
      live: summary.live,
      drm: summary.drm,
      size: !summary.live && summary.duration ? Math.round(((v.bandwidth + (summary.audio?.bandwidth || 0)) * summary.duration) / 8) || null : null,
      sizeEstimated: true,
      temporary,
      expiresAt,
      ...summary.block,
    }),
  );
}

/** Pure manifest reader (exported for tests). */
export function summarizeMpd(text) {
  const $ = cheerio.load(text, { xml: { xmlMode: true, decodeEntities: true } });
  // Some manifests use a namespace prefix (<mpd:MPD>); compare local names only.
  const local = (el) => String(el.tagName || el.name || "").replace(/^.*:/, "");
  const kids = (el, name) => $(el).children().toArray().filter((c) => local(c) === name);
  const all = (name) => $("*").toArray().filter((c) => local(c) === name);

  const mpd = all("MPD")[0];
  const live = $(mpd).attr("type") === "dynamic";
  const periods = kids(mpd, "Period");
  const duration =
    isoSeconds($(mpd).attr("mediaPresentationDuration")) ||
    periods.reduce((sum, p) => sum + (isoSeconds($(p).attr("duration")) || 0), 0) ||
    null;
  const drm = all("ContentProtection").length > 0;

  const period = periods[0];
  const sets = period ? kids(period, "AdaptationSet") : [];
  const attr = (el, name) => $(el).attr(name) || "";
  const kindOf = (as) => {
    const reps = kids(as, "Representation");
    const ct = attr(as, "contentType") || attr(as, "mimeType") || (reps[0] ? attr(reps[0], "mimeType") : "");
    if (/video/i.test(ct)) return "video";
    if (/audio/i.test(ct)) return "audio";
    if (/text|application\/(ttml|mp4)/i.test(ct)) return "text";
    const codecs = attr(as, "codecs") || (reps[0] ? attr(reps[0], "codecs") : "");
    if (/avc|hvc|hev|vp0?9|av01/i.test(codecs)) return "video";
    if (/mp4a|opus|ac-3|ec-3|ac-4|vorbis|flac|alac|dts|mha[0-9]|mhm[0-9]/i.test(codecs)) return "audio";
    if (
      attr(as, "audioSamplingRate") ||
      kids(as, "AudioChannelConfiguration").length ||
      reps.some((rep) => attr(rep, "audioSamplingRate") || kids(rep, "AudioChannelConfiguration").length)
    ) {
      return "audio";
    }
    return "other";
  };
  const hasAddressing = (as, rep) =>
    [rep, as, period].some((el) => ["SegmentTemplate", "SegmentList", "SegmentBase", "BaseURL"].some((n) => kids(el, n).length)) ||
    kids(mpd, "BaseURL").length > 0;
  const mimeOf = (as, rep) => attr(rep, "mimeType") || attr(as, "mimeType");

  let video = [];
  let audioCandidates = [];
  let addressingOk = true;

  for (const as of sets) {
    const kind = kindOf(as);
    if (kind !== "video" && kind !== "audio") continue;
    const role = kids(as, "Role").map((r) => attr(r, "value"))[0] || "";
    for (const rep of kids(as, "Representation")) {
      const mime = mimeOf(as, rep);
      if (!hasAddressing(as, rep)) addressingOk = false;
      const entry = {
        webm: /webm/i.test(mime),
        id: attr(rep, "id"),
        bandwidth: Number(attr(rep, "bandwidth")) || 0,
        height: Number(attr(rep, "height") || attr(as, "height")) || null,
        codecs: attr(rep, "codecs") || attr(as, "codecs") || null,
        lang: attr(as, "lang"),
        role,
      };
      if (kind === "video") video.push(entry);
      else audioCandidates.push(entry);
    }
  }

  // Many manifests offer the same video as MP4 and WebM. The engine merges MP4 pieces, so
  // use the MP4 family whenever there is one; WebM-only streams are reported as unsupported.
  const mp4Video = video.filter((v) => !v.webm);
  const container = mp4Video.length || !video.length ? "mp4" : "webm";
  if (container === "mp4") {
    video = mp4Video;
    const mp4Audio = audioCandidates.filter((a) => !a.webm);
    if (mp4Audio.length) audioCandidates = mp4Audio;
  }

  // One source per height: the highest bitrate of each.
  const byHeight = new Map();
  for (const v of video.sort((a, b) => b.bandwidth - a.bandwidth)) {
    const key = v.height || `bw${v.bandwidth}`;
    if (!byHeight.has(key)) byHeight.set(key, v);
  }
  // Main English audio when labelled, otherwise the main/first track; best bitrate within it.
  const audio =
    [...audioCandidates].sort(
      (a, b) =>
        Number(b.role === "main") - Number(a.role === "main") ||
        Number(/^en/i.test(b.lang)) - Number(/^en/i.test(a.lang)) ||
        b.bandwidth - a.bandwidth,
    )[0] || null;

  let block = { downloadable: true };
  if (drm) block = { downloadable: false, blockReason: "This stream is DRM-protected, so it can't be downloaded." };
  else if (live) block = { downloadable: false, blockReason: "Live streams can be watched, not downloaded." };
  else if (periods.length > 1) block = { downloadable: false, blockReason: "This stream is split into several periods (often ad breaks), which can't be saved as one file yet." };
  else if (audio?.webm) block = { downloadable: false, blockReason: "This stream only has WebM audio, which can't be merged into an MP4 file yet." };
  else if (container === "webm") block = { downloadable: false, blockReason: "This stream uses WebM pieces, which can't be merged into a file in the browser yet." };
  else if (!addressingOk) block = { downloadable: false, blockReason: "This stream's manifest uses an addressing scheme we can't read." };

  return {
    live,
    drm,
    duration,
    periods: periods.length,
    container,
    video: [...byHeight.values()].sort((a, b) => (b.height || 0) - (a.height || 0)),
    audio,
    block,
  };
}

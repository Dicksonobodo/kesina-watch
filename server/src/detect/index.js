import { USER_AGENT } from "../config.js";
import { getCached, setCached } from "../cache.js";
import { assertPublicUrl } from "../safety.js";
import { withTimeout } from "../limits.js";
import { countAdResources, isAdUrl } from "./blocker.js";
import { browserDetect, runLimited } from "./browser.js";
import { extractMetadata } from "./metadata.js";
import { classify, probeCandidates } from "./media.js";

/**
 * 1. Light pass: download the HTML and look for video links (fast, cheap).
 * 2. Browser pass: if nothing is found, open the page in headless Chrome with ads
 *    blocked and watch its network traffic for video streams.
 * 3. Probe every candidate for type, qualities, size, live and DRM.
 */
const DETECT_TIMEOUT_MS = 75_000;
// Same link requested by several people at once: do the work once, share the result.
const inFlight = new Map();

export function detectStats() {
  return { inFlight: inFlight.size, browser: runLimited.stats() };
}

export async function detect(rawUrl) {
  const url = (await assertPublicUrl(rawUrl)).href;
  const cached = getCached(url);
  if (cached) return { ...cached, cached: true };
  if (inFlight.has(url)) return inFlight.get(url);

  const work = withTimeout(runDetect(url), DETECT_TIMEOUT_MS, "That page took too long to read. Try again, or try the page where the player is.")
    .finally(() => inFlight.delete(url));
  inFlight.set(url, work);
  return work;
}

async function runDetect(url) {
  const started = Date.now();

  // A direct stream / file link (…/live.m3u8, …/movie.mp4): probe it straight away, no page to read.
  const direct = await directMedia(url);
  if (direct) {
    const sources = await probeCandidates([{ url, referer: null, type: direct }]);
    if (sources.length) {
      const result = {
        url,
        site: new URL(url).hostname.replace(/^www\./, ""),
        title: titleFromFileUrl(url, sources.some((s) => s.live)),
        year: null,
        runtime: minutesFrom(sources),
        poster: null,
        live: sources.some((s) => s.live),
        drm: sources.every((s) => s.drm),
        sources: sources.filter((s) => !s.drm).map(publicSource),
        subtitles: [],
        adsBlocked: 0,
        popupsBlocked: 0,
        engine: "direct",
        tookMs: Date.now() - started,
      };
      setCached(url, result);
      return result;
    }
  }

  const light = await lightPass(url);
  let meta = light?.meta ?? null;
  let candidates = (light?.meta.candidates ?? []).map((u) => ({ url: u, referer: url }));
  let shield = { adsBlocked: light ? await countAdResources(light.meta.resources, url) : 0, popupsBlocked: 0 };
  let engine = "light";

  candidates = await dropAds(candidates, url);
  let sources = candidates.length ? await probeCandidates(candidates) : [];

  if (!sources.length) {
    engine = "browser";
    const page = await browserDetect(url);
    shield = { adsBlocked: page.adsBlocked, popupsBlocked: page.popupsBlocked };
    const pageMeta = extractMetadata(page.html, page.finalUrl);
    meta = mergeMeta(meta, pageMeta, page.title);
    const browserCandidates = await dropAds(
      [...page.candidates, ...pageMeta.candidates.map((u) => ({ url: u, referer: page.finalUrl }))],
      page.finalUrl,
    );
    sources = await probeCandidates(browserCandidates);
  }

  const result = {
    url,
    site: new URL(url).hostname.replace(/^www\./, ""),
    title: meta?.title || "Untitled",
    year: meta?.year ?? null,
    runtime: meta?.runtime ?? minutesFrom(sources),
    poster: meta?.poster ?? null,
    live: sources.some((s) => s.live),
    drm: sources.length > 0 && sources.every((s) => s.drm),
    sources: sources.filter((s) => !s.drm).map(publicSource),
    subtitles: (meta?.subtitles ?? []).slice(0, 12).map((s) => ({ ...s, referer: url })),
    ...shield,
    engine,
    tookMs: Date.now() - started,
  };
  setCached(url, result);
  return result;
}

// "hls" / "file" when the link itself is a video stream or file, else null.
async function directMedia(url) {
  const byName = classify(url);
  if (byName === "hls" || byName === "file") return byName;
  if (/\.(html?|php|aspx?)(\?|$)/i.test(url)) return null;
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": USER_AGENT }, redirect: "follow", signal: AbortSignal.timeout(6_000) });
    const type = classify(res.url || url, res.headers.get("content-type") || "");
    return type === "hls" || type === "file" ? type : null;
  } catch {
    return null;
  }
}

function titleFromFileUrl(url, live) {
  const { hostname, pathname } = new URL(url);
  const name = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "")
    .replace(/\.(m3u8|mp4|webm|mkv|mov)$/i, "")
    .replace(/[-_.]+/g, " ")
    .trim();
  const generic = !name || /^(index|playlist|master|live|stream|chunklist|manifest)$/i.test(name);
  return generic ? `${live ? "Live stream" : "Video"} · ${hostname.replace(/^www\./, "")}` : name;
}

async function lightPass(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
    const html = await res.text();
    return { meta: extractMetadata(html, res.url || url) };
  } catch {
    return null; // blocked or slow: the browser pass will try
  }
}

async function dropAds(candidates, pageUrl) {
  const flags = await Promise.all(candidates.map((c) => isAdUrl(c.url, pageUrl)));
  return candidates.filter((_, i) => !flags[i]);
}

function mergeMeta(light, page, pageTitle) {
  if (!light || light.title === "Untitled") return { ...page, title: page.title !== "Untitled" ? page.title : pageTitle || "Untitled" };
  return {
    title: light.title,
    year: light.year ?? page.year,
    poster: light.poster ?? page.poster,
    runtime: light.runtime ?? page.runtime,
    subtitles: light.subtitles?.length ? light.subtitles : page.subtitles,
  };
}

function minutesFrom(sources) {
  const d = sources.find((s) => s.duration && !s.live)?.duration;
  return d ? Math.round(d / 60) : null;
}

function publicSource(s) {
  return {
    id: s.id,
    quality: s.quality,
    label: s.label,
    type: s.type, // "file" | "hls" | "dash"
    container: s.container ?? (s.type === "file" ? "mp4" : null),
    height: s.height,
    size: s.size,
    live: s.live,
    duration: s.duration,
    audioUrl: s.audioUrl ?? null, // set when the stream's audio is a separate track
    masterUrl: s.masterUrl ?? null, // the full multi-quality playlist, used by the player
    url: s.url,
    referer: s.referer,
  };
}

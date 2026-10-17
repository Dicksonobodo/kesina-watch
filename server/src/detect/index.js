import { getCached, setCached } from "../cache.js";
import { HttpError, assertPublicUrl } from "../safety.js";
import { withTimeout } from "../limits.js";
import { safeFetch } from "../net.js";
import { countAdResources, isAdUrl } from "./blocker.js";
import { browserDetect, runLimited } from "./browser.js";
import { extractMetadata } from "./metadata.js";
import { classify, linkExpiry, reasonForStatus, sniff } from "./inspect.js";
import { groupStreams } from "./streams.js";
import { probeCandidates } from "./media.js";

/**
 * 1. Look at the link itself: is it a media file / playlist / manifest, or a web page?
 * 2. Media link: probe it directly. Web page: read its HTML for video links (fast, cheap).
 * 3. Nothing usable: open the page in headless Chrome with ads blocked and watch its
 *    network traffic for video streams (players that load their source with JavaScript).
 * 4. Probe every candidate for type, qualities, size, live and DRM, and explain empty results.
 */
const DETECT_TIMEOUT_MS = 75_000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const SNIFF_BYTES = 64 * 1024;
const EMPTY_RESULT_TTL_MS = 60_000;
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

// The quick read (one GET, links in the HTML) usually answers in a second or two. When it's
// still going after this long, the browser pass starts alongside it instead of after it.
const BROWSER_HEAD_START_MS = 3_000;

async function runDetect(url) {
  let early = null;
  const browserPass = () => {
    if (!early) {
      early = browserDetect(url);
      early.catch(() => {}); // awaited below when it's needed; unused otherwise
    }
    return early;
  };
  // A media link never needs the browser.
  const timer = classify(url) ? null : setTimeout(browserPass, BROWSER_HEAD_START_MS);
  try {
    return await detectWith(url, browserPass);
  } finally {
    clearTimeout(timer);
  }
}

async function detectWith(url, browserPass) {
  const started = Date.now();
  const first = await inspectLink(url);

  /* ---- the link is the video itself (file, HLS playlist or DASH manifest) ---- */
  if (["hls", "dash", "file"].includes(first.kind)) {
    const { sources, rejected } = await probeCandidates([{ url: first.finalUrl, referer: null, type: first.kind }]);
    return finish(url, started, {
      inputKind: "media",
      engine: "direct",
      meta: { title: titleFromFileUrl(first.finalUrl, sources.some((s) => s.live)) },
      sources,
      rejected,
      redirected: first.finalUrl !== url ? first.finalUrl : null,
    });
  }

  /* ---- the link answered with an error ---- */
  if (first.status && first.status >= 400) {
    const looksLikeMedia = Boolean(classify(url)) || linkExpiry(url).temporary;
    if (looksLikeMedia) {
      // A media address that fails is dead or expired; a browser won't change that.
      return finish(url, started, {
        inputKind: "media",
        engine: "direct",
        meta: { title: titleFromFileUrl(url, false) },
        sources: [],
        rejected: [{ url, reason: reasonForStatus(first.status), status: first.status }],
      });
    }
    if (first.status === 404 || first.status === 410) {
      throw new HttpError(404, `That page doesn't exist (the site answered ${first.status}). Check the link.`);
    }
    // 401/403/429/5xx on a page is often an anti-bot check that a real browser passes.
  }

  /* ---- a web page: read its HTML first ---- */
  let meta = null;
  let candidates = [];
  let shield = { adsBlocked: 0, popupsBlocked: 0 };
  let engine = "light";
  if (first.html) {
    meta = extractMetadata(first.html, first.finalUrl);
    candidates = meta.candidates.map((u) => ({ url: u, referer: first.finalUrl, hint: meta.candidateHints?.[u] }));
    shield.adsBlocked = await countAdResources(meta.resources, first.finalUrl);
  }
  candidates = await dropAds(candidates, first.finalUrl);
  let { sources, rejected } = candidates.length ? await probeCandidates(candidates) : { sources: [], rejected: [] };
  let page = null;

  if (!usable(sources)) {
    engine = "browser";
    page = await browserPass();
    shield = { adsBlocked: page.adsBlocked, popupsBlocked: page.popupsBlocked };
    let pageMeta = extractMetadata(page.html, page.finalUrl);
    meta = mergeMeta(meta, pageMeta, page.title);
    let browserCandidates = await dropAds(
      [...page.candidates, ...pageMeta.candidates.map((u) => ({ url: u, referer: page.finalUrl, hint: pageMeta.candidateHints?.[u] }))],
      page.finalUrl,
    );
    ({ sources, rejected } = await probeCandidates(browserCandidates));

    // A player can emit an unusable preview/request before its actual stream. Retry
    // once with an explicit play nudge instead of treating that first request as final.
    if (!usable(sources) && page.candidates.length && !page.emeKeySystem) {
      const again = await browserDetect(url, { forcePlay: true });
      pageMeta = extractMetadata(again.html, again.finalUrl);
      meta = mergeMeta(meta, pageMeta, again.title);
      browserCandidates = await dropAds(
        [...browserCandidates, ...again.candidates, ...pageMeta.candidates.map((u) => ({ url: u, referer: again.finalUrl, hint: pageMeta.candidateHints?.[u] }))],
        again.finalUrl,
      );
      ({ sources, rejected } = await probeCandidates(browserCandidates));
      shield = { adsBlocked: shield.adsBlocked + again.adsBlocked, popupsBlocked: shield.popupsBlocked + again.popupsBlocked };
      page = mergeSignals(page, again);
    }
  }

  // No stream of its own, but a list of lives (an events calendar…): the viewer picks one.
  const picks = page && !usable(sources) ? await dropAds(page.picks ?? [], page.finalUrl) : [];
  return finish(url, started, { inputKind: "page", engine, meta, sources, rejected, page, shield, pageStatus: first.status, picks });
}

/**
 * One GET to the pasted link, following (validated) redirects. Reads only the first 64 KB
 * of media, and at most 3 MB of a web page.
 * Returns { status, finalUrl, contentType, kind, container, html }.
 */
async function inspectLink(url) {
  let res;
  try {
    res = await safeFetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-US,en;q=0.9" },
      timeoutMs: 12_000,
    });
  } catch (err) {
    if (err instanceof HttpError) throw err; // private address, redirect loop
    return { status: null, finalUrl: url, kind: null }; // blocked or slow: the browser pass will try
  }
  const finalUrl = res.url || url;
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    res.body?.cancel().catch(() => {});
    return { status: res.status, finalUrl, contentType, kind: null };
  }

  const reader = res.body?.getReader();
  const parts = [];
  let size = 0;
  let decided = null;
  try {
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      size += value.byteLength;
      if (!decided && size >= 1024) decided = sniff(Buffer.concat(parts), contentType);
      if (decided && decided.kind !== "html") break; // media: the first bytes are enough
      if (size >= (decided?.kind === "html" ? MAX_HTML_BYTES : SNIFF_BYTES)) break;
    }
  } catch {
    /* a truncated read is fine for sniffing */
  } finally {
    reader?.cancel().catch(() => {});
  }
  const body = Buffer.concat(parts);
  decided = sniff(body, contentType);
  // Servers that call everything octet-stream: trust a video extension in the address.
  if (!decided.kind && /octet-stream|binary/.test(contentType) && classify(finalUrl) === "file") decided = { kind: "file" };
  if (!decided.kind && classify(finalUrl, contentType) && decided.kind !== "data") decided = { kind: classify(finalUrl, contentType) };
  return {
    status: res.status,
    finalUrl,
    contentType,
    kind: decided.kind,
    container: decided.container,
    html: decided.kind === "html" ? body.toString("utf8") : null,
  };
}

const usable = (sources) => sources.some((s) => !s.drm);

/** Builds the response, explains empty results, and caches it. */
function finish(url, started, { inputKind, engine, meta, sources, rejected, page = null, shield = {}, redirected = null, pageStatus = null, picks = [] }) {
  const drmFound = sources.some((s) => s.drm) || Boolean(page?.emeKeySystem);
  // DRM sources can neither be played nor saved here, so they aren't listed. Everything else
  // is: sources that can't be saved (live, WebM-only or multi-period DASH…) can still be watched.
  const grouped = groupStreams(sources.filter((s) => !s.drm), { pageTitle: meta?.title });
  const visible = grouped.sources;
  const hidden = sources.filter((s) => !visible.includes(s));
  const offered = visible.length || drmFound ? [] : picks;
  const { reason, message } = visible.length
    ? explainPartial(visible)
    : offered.length
      ? { reason: "pick", message: offered.length === 1 ? "This page links to a live. Open it to watch." : `This page lists ${offered.length} lives. Pick one to watch.` }
      : explainEmpty({ hidden, rejected, page, inputKind, drmFound, pageStatus });

  const notes = [];
  const expiring = visible.find((s) => s.expiresAt && s.expiresAt > Date.now());
  if (expiring) {
    const mins = Math.max(1, Math.round((expiring.expiresAt - Date.now()) / 60_000));
    notes.push(
      mins < 180
        ? `This is a temporary video link. It expires in about ${mins} minute${mins === 1 ? "" : "s"}, so start the download soon.`
        : "This is a temporary video link. If the download fails later, analyze the page again for a fresh link.",
    );
  } else if (visible.some((s) => s.temporary)) {
    notes.push("This looks like a temporary video link. If the download fails, analyze the page again for a fresh link.");
  }
  if (redirected) notes.push(`The link redirected to ${new URL(redirected).hostname}.`);
  if (visible.length && hidden.some((s) => s.drm)) notes.push("Some qualities are DRM-protected and were left out.");
  if (visible.some((s) => s.noAudio)) {
    notes.push(
      visible.every((s) => s.noAudio)
        ? "No sound track was found: the player loaded video only. The download will be silent."
        : "Qualities marked video-only have no sound track and will download silent.",
    );
  }

  const result = {
    url,
    site: new URL(url).hostname.replace(/^www\./, ""),
    inputKind, // "media" (the link is the video) | "page" (a web page with a player)
    title: meta?.title || "Untitled",
    year: meta?.year ?? null,
    runtime: meta?.runtime ?? minutesFrom(visible),
    poster: meta?.poster ?? null,
    live: visible.some((s) => s.live),
    drm: !visible.length && drmFound,
    sources: visible.map(publicSource),
    streams: grouped.streams, // one entry per stream on the page, each with its title and sources
    picks: offered, // a listing page's lives, [{ title, url, image, when }], each detected when picked
    subtitles: (meta?.subtitles ?? []).slice(0, 12).map((s) => ({ ...s, referer: url })),
    reason, // null when something can be downloaded
    message,
    notes,
    checked: { candidates: sources.length + rejected.length, rejected: rejected.length },
    adsBlocked: shield.adsBlocked ?? 0,
    popupsBlocked: shield.popupsBlocked ?? 0,
    engine,
    tookMs: Date.now() - started,
  };

  const soonest = Math.min(...visible.map((s) => s.expiresAt || Infinity));
  const ttl = !visible.length ? EMPTY_RESULT_TTL_MS : Number.isFinite(soonest) ? soonest - Date.now() - 60_000 : undefined;
  setCached(url, result, ttl);
  return result;
}

// Sources exist; say so if none of them can be saved (e.g. live only).
function explainPartial(visible) {
  if (visible.some((s) => s.downloadable !== false)) return { reason: null, message: null };
  const block = visible.find((s) => s.blockReason)?.blockReason;
  if (visible.every((s) => s.live)) return { reason: "live", message: "This is a live stream. It can be watched here, but live streams can't be downloaded." };
  return { reason: "not_downloadable", message: `${block || "This video can't be downloaded."} You can still watch it here.` };
}

function explainEmpty({ hidden, rejected, page, inputKind, drmFound, pageStatus }) {
  const count = (fn) => rejected.filter(fn).length;
  if (drmFound) {
    return {
      reason: "drm",
      message: "This video is protected with DRM (encrypted playback licensed to the site's own player). Dixon Watch doesn't bypass DRM, so it can't be downloaded or played here.",
    };
  }
  if (hidden.length && hidden.every((s) => s.live)) {
    return {
      reason: "live",
      message: "This is a live DASH stream. Live streams can't be downloaded, and the built-in player doesn't play DASH yet. Watch it on the original site.",
    };
  }
  const unsupported = hidden.find((s) => s.blockReason);
  if (unsupported) return { reason: "unsupported", message: unsupported.blockReason };

  const expired = rejected.some((r) => r.reason === "gone" || (linkExpiry(r.url).expiresAt ?? Infinity) < Date.now());
  const sessionOnly = count((r) => r.reason === "forbidden" && r.observedStatus && r.observedStatus < 400);
  const forbidden = count((r) => r.reason === "forbidden");

  if (inputKind === "media") {
    if (expired || (forbidden && linkExpiry(rejected[0]?.url).temporary)) {
      return {
        reason: "expired",
        message: "This video link has expired or been removed. Temporary links stop working after a while. Analyze the page that plays the video again to get a fresh link.",
      };
    }
    if (forbidden) {
      return { reason: "forbidden", message: "The server refused access to this video (HTTP 403/401). It may need a sign-in or only allow its own website to play it." };
    }
    if (rejected.some((r) => r.reason === "blocked")) {
      return { reason: "blocked", message: "That link leads to a private or internal address, which isn't allowed." };
    }
    return { reason: "not_media", message: "The link didn't return a video we can read. It may be a web page or an unsupported file type." };
  }

  if (sessionOnly) {
    return {
      reason: "needs_session",
      message: "The site's player loaded a video, but the video server only serves it to that browser session (cookies or one-time tokens). Dixon Watch doesn't copy sessions, so it can't download this one.",
    };
  }
  if (page?.loginForm || pageStatus === 401) {
    return {
      reason: "needs_login",
      message: "This page asks you to sign in before it shows the video. Dixon Watch can't use your accounts on other sites and doesn't get around sign-in walls or paywalls.",
    };
  }
  if (page?.botCheck) {
    return {
      reason: "bot_check",
      message: "The site showed an anti-bot check instead of the page, so we couldn't see its player. Try the page again later.",
    };
  }
  if (expired) {
    return { reason: "expired", message: "The page pointed to a video link that has expired or been removed. Reload the page on the original site and try again." };
  }
  if (forbidden) {
    return { reason: "forbidden", message: "The page has a video, but its server refused to let us read it (HTTP 403)." };
  }
  if (page?.blobVideo) {
    return {
      reason: "unsupported",
      message: "This page plays its video through a custom script player, and we couldn't find a stream address we can save.",
    };
  }
  return {
    reason: "no_video",
    message:
      page?.videoElements
        ? "There's a video player on this page, but it didn't load a video we could find. Press play on the original site, then paste the address of the page where the video plays."
        : "No video was found on this page. If it's a listing page, open the movie or episode first and paste the page where the player is. You can also paste a direct video link.",
  };
}

// "hls" / "file" from the link alone was the old fast path; kept for titles.
function titleFromFileUrl(url, live) {
  const { hostname, pathname } = new URL(url);
  const name = decodeURIComponent(pathname.split("/").filter(Boolean).at(-1) ?? "")
    .replace(/\.(m3u8|mpd|mp4|m4v|webm|mkv|mov|ts)$/i, "")
    .replace(/[-_.]+/g, " ")
    .trim();
  const generic = !name || /^\d+$/.test(name) || /^(index|playlist|master|live|stream|chunklist|manifest|dash|video)$/i.test(name);
  return generic ? `${live ? "Live stream" : "Video"} · ${hostname.replace(/^www\./, "")}` : name;
}

async function dropAds(candidates, pageUrl) {
  const seen = new Set();
  const unique = candidates.filter((c) => !seen.has(c.url) && seen.add(c.url));
  const flags = await Promise.all(unique.map((c) => isAdUrl(c.url, pageUrl)));
  return unique.filter((_, i) => !flags[i]);
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

function mergeSignals(a, b) {
  return {
    ...b,
    emeKeySystem: a.emeKeySystem || b.emeKeySystem,
    blobVideo: a.blobVideo || b.blobVideo,
    loginForm: a.loginForm || b.loginForm,
    botCheck: a.botCheck && b.botCheck,
    videoElements: Math.max(a.videoElements, b.videoElements),
  };
}

function minutesFrom(sources) {
  const d = sources.find((s) => s.duration && !s.live)?.duration;
  return d ? Math.round(d / 60) : null;
}

function publicSource(s) {
  return {
    id: s.id,
    streamId: s.streamId ?? null,
    streamTitle: s.streamTitle ?? null,
    quality: s.quality,
    label: s.label,
    type: s.type, // "file" | "hls" | "dash"
    container: s.container ?? (s.type === "file" ? "mp4" : null),
    height: s.height,
    size: s.size,
    sizeEstimated: Boolean(s.sizeEstimated), // from the stream's bitrate, not an exact byte count
    bandwidth: s.bandwidth ?? null,
    codecs: s.codecs ?? null,
    live: s.live,
    duration: s.duration,
    downloadable: s.downloadable !== false,
    blockReason: s.blockReason ?? null,
    encryption: s.encryption ?? null,
    temporary: Boolean(s.temporary),
    expiresAt: s.expiresAt ?? null,
    audioUrl: s.audioUrl ?? null, // HLS: audio served as a separate track
    noAudio: Boolean(s.noAudio), // the stream the player loaded has no sound track
    videoRep: s.videoRep ?? null, // DASH: representation ids the download engine assembles
    audioRep: s.audioRep ?? null,
    masterUrl: s.masterUrl ?? null, // the full multi-quality playlist, used by the player
    url: s.url,
    referer: s.referer,
  };
}

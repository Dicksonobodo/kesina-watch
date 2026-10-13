import { lookup } from "node:dns/promises";
import puppeteer from "puppeteer-core";
import { config, USER_AGENT } from "../config.js";
import { findChrome } from "../chrome.js";
import { createLimiter } from "../limits.js";
import { HttpError, isPrivateHostname, isPrivateIp } from "../safety.js";
import { getBlocker } from "./blocker.js";
import { classify } from "./inspect.js";
import { cleanLabel } from "./streams.js";

// Hostnames the page asks for are resolved (cached for a minute); private answers are refused.
const DNS_TTL_MS = 60_000;
const dnsCache = new Map();
async function resolvesPrivate(host) {
  const hit = dnsCache.get(host);
  if (hit && Date.now() - hit.at < DNS_TTL_MS) return hit.private;
  const addresses = await lookup(host, { all: true }).catch(() => []);
  const result = addresses.some((a) => isPrivateIp(a.address));
  if (dnsCache.size > 5000) dnsCache.clear();
  dnsCache.set(host, { private: result, at: Date.now() });
  return result;
}

// Notes whether the page asks for a DRM key system (Widevine, PlayReady, FairPlay).
// Runs in every frame before the page's own scripts. It only observes; nothing is changed.
const EME_PROBE = () => {
  const nav = window.navigator;
  if (!nav.requestMediaKeySystemAccess) return;
  const original = nav.requestMediaKeySystemAccess.bind(nav);
  nav.requestMediaKeySystemAccess = (keySystem, configs) => {
    window.__dwEme = keySystem;
    return original(keySystem, configs);
  };
};

const NAV_TIMEOUT_MS = 25_000;
const MEDIA_WAIT_MS = 12_000;
const PLAY_SELECTORS = [
  ".vjs-big-play-button",
  ".jw-display-icon-display",
  ".jw-icon-display",
  ".plyr__control--overlaid",
  ".fp-play",
  "[class*='play-button']",
  "[class*='playButton']",
  "[aria-label*='play' i]",
  "#play",
  ".play",
];

// Headless pages are the expensive part: a few at a time, with a bounded waiting line.
export const runLimited = createLimiter(config.browserSlots, { maxQueue: 20, waitMs: 45_000 });
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.connected) return b;
  }
  const executablePath = findChrome();
  if (!executablePath) {
    throw new HttpError(500, "No Chrome/Edge found on the server. Set CHROME_PATH in server/.env.");
  }
  browserPromise = puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-first-run",
      "--mute-audio",
      "--autoplay-policy=no-user-gesture-required",
      // Keeps cross-site player iframes in the same process so we can see their network traffic.
      "--disable-features=site-per-process,IsolateOrigins",
      "--disable-site-isolation-trials",
      ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    ],
  });
  return browserPromise;
}

/**
 * Runs fn(page, stats) in a fresh, private Chrome tab with ads and trackers blocked,
 * pop-ups killed and private addresses refused. The tab is always closed afterwards.
 */
function withShieldedPage(fn) {
  return runLimited(async () => {
    const [browser, blocker] = await Promise.all([getBrowser(), getBlocker().catch(() => null)]);
    const context = await browser.createBrowserContext();
    const stats = { adsBlocked: 0, popupsBlocked: 0 };
    const page = await context.newPage();

    // Kill every pop-up / new tab the page tries to open (registered after our own page exists).
    context.on("targetcreated", async (target) => {
      if (target.type() !== "page") return;
      const opened = await target.page().catch(() => null);
      if (opened && opened !== page) {
        stats.popupsBlocked++;
        opened.close().catch(() => {});
      }
    });

    try {
      await page.setUserAgent({ userAgent: USER_AGENT });
      await page.setViewport({ width: 1366, height: 768 });
      await page.setRequestInterception(true);

      // Our own filter: never let the page reach private/internal addresses, by name or by
      // what the name resolves to. Redirect hops arrive here as new requests too.
      page.on("request", (req) => {
        if (req.isInterceptResolutionHandled()) return;
        let host = "";
        try {
          const u = new URL(req.url());
          if (/^(https?|wss?):$/.test(u.protocol)) host = u.hostname.replace(/^\[|\]$/g, "");
        } catch {
          /* data:, blob: etc. */
        }
        if (!host) return req.continue(req.continueRequestOverrides(), 0);
        if (isPrivateHostname(host)) return req.abort("accessdenied", 1000);
        req.enqueueInterceptAction(async () => {
          if (await resolvesPrivate(host)) req.abort("accessdenied", 1000);
          else req.continue(req.continueRequestOverrides(), 0);
        });
      });
      await page.evaluateOnNewDocument(EME_PROBE);

      if (blocker) await blocker.enableBlockingInPage(page);

      page.on("requestfailed", (req) => {
        // Chrome reports blocker aborts as "net::ERR_BLOCKED_BY_CLIENT.Inspector".
        if (req.failure()?.errorText?.startsWith("net::ERR_BLOCKED_BY_CLIENT")) stats.adsBlocked++;
      });

      return await fn(page, stats);
    } finally {
      await context.close().catch(() => {});
    }
  });
}

async function open(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch((err) => {
    if (/timeout/i.test(err.message)) return;
    // The address is a file download rather than a page (Chrome aborts the navigation): the
    // network listener has already seen the response, so detection carries on.
    if (/ERR_ABORTED/i.test(err.message)) return;
    if (/ERR_ACCESS_DENIED/i.test(err.message)) {
      throw new HttpError(400, "That link leads to a private or internal address, so it wasn't opened.");
    }
    if (/ERR_NAME_NOT_RESOLVED/i.test(err.message)) throw new HttpError(400, "We couldn't find that website. Check the link.");
    throw new HttpError(502, "That page wouldn't load. It may be down or blocking us.");
  });
}

/**
 * Opens the page with ads blocked and records every video request.
 * Returns { html, title, candidates, adsBlocked, popupsBlocked, finalUrl }.
 */
export function browserDetect(url, { forcePlay = false } = {}) {
  return withShieldedPage(async (page, stats) => {
    const candidates = new Map();
    const failed = []; // media requests the site itself answered with an error
    const sniffs = [];
    let activeLabel = null; // text of the channel button being clicked while switching

    // Players often load their playlist from an address that doesn't end in .m3u8/.mpd and
    // isn't labelled as one (an API route, text/plain). Read small script-loaded text responses
    // and recognise HLS / DASH by their first line instead.
    const sniffPlaylist = async (res, contentType) => {
      try {
        const kind = res.request().resourceType();
        if (!["xhr", "fetch", "other"].includes(kind) || res.status() !== 200) return;
        if (/^(image|font|audio|video)\/|javascript|css|wasm/.test(contentType)) return;
        const length = Number(res.headers()["content-length"]);
        if (length && length > 2 * 1024 * 1024) return;
        const head = (await res.text()).slice(0, 1024).replace(/^﻿/, "").trimStart();
        const found = head.startsWith("#EXTM3U") ? "hls" : /^(<\?xml[^>]*>\s*)?<(\w+:)?MPD[\s>]/.test(head) ? "dash" : null;
        if (!found || candidates.has(res.url())) return;
        candidates.set(res.url(), {
          url: res.url(),
          type: found,
          contentType,
          observedStatus: 200,
          referer: res.request().headers().referer || res.frame()?.url() || url,
          frameUrl: res.frame()?.url() || url,
          clickLabel: activeLabel,
        });
      } catch {
        /* body not available (redirect, preflight, page closing) */
      }
    };
    page.on("response", (res) => {
      const reqUrl = res.url();
      if (!/^https?:/i.test(reqUrl)) return;
      const headers = res.headers();
      const contentType = (headers["content-type"] || "").toLowerCase();
      const type = classify(reqUrl, contentType);
      if (!type && !candidates.has(reqUrl)) {
        sniffs.push(sniffPlaylist(res, contentType));
        return;
      }
      if (!type || candidates.has(reqUrl)) return;
      const status = res.status();
      if (status >= 300 && status < 400) return; // the redirect target arrives as its own response
      if (status >= 400) {
        if (failed.length < 50) failed.push({ url: reqUrl, status });
        return;
      }
      // An error page or API answer at a ".mp4" address is not a video.
      if (type === "file" && /text\/html|json|xml|text\/plain/.test(contentType)) return;
      candidates.set(reqUrl, {
        url: reqUrl,
        type,
        contentType,
        observedStatus: status,
        referer: res.request().headers().referer || res.frame()?.url() || url,
        frameUrl: res.frame()?.url() || url,
        clickLabel: activeLabel,
      });
    });

    await open(page, url);

    // Give players a moment, then nudge them to start.
    await waitForMedia(candidates, 3_000);
    const candidateCount = candidates.size;
    if (!candidateCount || forcePlay) await nudgePlayers(page);
    await waitForMedia(candidates, MEDIA_WAIT_MS, forcePlay ? candidateCount + 1 : 1);
    if (candidates.size) await sleep(1_500); // let a master playlist arrive alongside variants
    await Promise.race([Promise.allSettled(sniffs), sleep(3_000)]);

    // Pages with channel buttons or tabs: click through them so every stream gets requested,
    // remembering which button produced which stream.
    if (candidates.size) await switchChannels(page, candidates, (label) => (activeLabel = label));

    // Name each stream after its player (frame title, iframe title, heading) when no button named it.
    const labels = await frameLabels(page, url);
    for (const c of candidates.values()) {
      c.hint = cleanLabel(c.clickLabel);
      c.frameHint = labels.get(c.frameUrl) || "";
    }

    const signals = await pageSignals(page);
    return {
      html: await page.content().catch(() => ""),
      title: await page.title().catch(() => ""),
      finalUrl: page.url(),
      candidates: [...candidates.values()],
      failed,
      ...signals,
      ...stats,
    };
  });
}

const SWITCHER_SELECTOR = [
  "[data-channel]", "[data-stream]", "[data-src]", "[data-url]", "[data-link]", "[data-source]",
  ".channel", ".channel-item", ".channels li", ".channels a", ".channel-list li", "[class*='channel'] li", "[class*='channel'] button",
  ".stream-item", "[class*='stream-list'] li", "[class*='stream-list'] a", ".server-item", ".servers li", ".servers a", ".live-item",
  "[class*='playlist'] li", "[role='tab']", ".tabs li", ".tabs button",
].join(",");
const SWITCH_BUDGET_MS = 14_000;
const MAX_SWITCHES = 8;

/**
 * Clicks a page's channel buttons one by one (up to a time budget) so that each stream the page
 * can show is requested, tagging new media requests with the button's text. Buttons that would
 * leave the page are skipped.
 */
async function switchChannels(page, candidates, setActive) {
  const deadline = Date.now() + SWITCH_BUDGET_MS;
  const startUrl = page.url();
  for (const frame of page.frames()) {
    const items = await frame
      .evaluate((selector) => {
        const clean = (t) => (t || "").replace(/\s+/g, " ").trim();
        const seen = new Set();
        const list = [];
        document.querySelectorAll(selector).forEach((el) => {
          if (el.offsetParent === null) return;
          const text = clean(el.getAttribute("title") || el.getAttribute("aria-label") || el.innerText || el.textContent);
          if (text.length < 2 || text.length > 40 || seen.has(text.toLowerCase())) return;
          const a = el.closest("a");
          const href = a?.getAttribute("href") || "";
          const carriesStream = el.matches("[data-src],[data-url],[data-stream],[data-link],[data-source],[data-channel]");
          if (a && href && !href.startsWith("#") && !/^javascript:/i.test(href) && !carriesStream) return; // would navigate away
          seen.add(text.toLowerCase());
          el.setAttribute("data-dw-switch", String(list.length));
          list.push(text);
        });
        return list;
      }, SWITCHER_SELECTOR)
      .catch(() => []);
    if (items.length < 2) continue;

    for (let i = 0; i < Math.min(items.length, MAX_SWITCHES); i++) {
      if (Date.now() > deadline) return;
      const before = candidates.size;
      setActive(items[i]);
      await frame.evaluate((n) => document.querySelector(`[data-dw-switch="${n}"]`)?.click(), i).catch(() => {});
      await waitForMedia(candidates, 3_000, before + 1);
      setActive(null);
      if (page.url() !== startUrl) return;
    }
    return; // one group of channel buttons is enough
  }
}

/**
 * A name for each player frame: its iframe's title/aria-label, the heading near the iframe,
 * or the frame's own title. Returns Map(frameUrl → label).
 */
async function frameLabels(page, pageUrl) {
  const labels = new Map();
  const inFrame = (frame) =>
    frame
      .evaluate(() => {
        const clean = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const heading = (el) => {
          for (let n = el.parentElement, i = 0; n && i < 4; n = n.parentElement, i++) {
            const h = [...n.querySelectorAll("h1,h2,h3,h4,[class*='title'],[class*='name']")].find((x) => !x.contains(el) && clean(x.textContent).length > 1 && clean(x.textContent).length < 80);
            if (h) return clean(h.textContent);
          }
          return "";
        };
        const iframes = {};
        document.querySelectorAll("iframe[src]").forEach((f) => {
          iframes[f.src] = clean(f.title || f.getAttribute("aria-label") || f.dataset.title) || heading(f);
        });
        const v = document.querySelector("video");
        const own =
          (v && (clean(v.title || v.getAttribute("aria-label") || v.dataset?.title) || heading(v))) ||
          clean(document.querySelector('meta[property="og:title"]')?.content) ||
          clean(document.title);
        return { iframes, own };
      })
      .catch(() => null);

  const main = page.mainFrame();
  const results = new Map();
  for (const frame of page.frames()) results.set(frame, await inFrame(frame));
  const parent = results.get(main);
  for (const [frame, r] of results) {
    if (!r) continue;
    const url = frame.url();
    const label = cleanLabel(parent?.iframes?.[url]) || cleanLabel(r.own);
    if (label && url) labels.set(url, label);
  }
  if (!labels.has(pageUrl) && parent?.own) labels.set(pageUrl, cleanLabel(parent.own));
  labels.set(main.url(), cleanLabel(parent?.own) || "");
  return labels;
}

/**
 * What the page looks like after loading, across all frames: a DRM key-system request,
 * a video element fed by script (blob: = Media Source Extensions), a sign-in form,
 * or an anti-bot check page.
 */
async function pageSignals(page) {
  const out = { emeKeySystem: null, blobVideo: false, videoElements: 0, loginForm: false, botCheck: false };
  for (const frame of page.frames()) {
    const s = await frame
      .evaluate(() => {
        const videos = [...document.querySelectorAll("video")];
        const visible = (el) => el.offsetParent !== null;
        return {
          eme: window.__dwEme || null,
          blob: videos.some((v) => (v.currentSrc || v.src || "").startsWith("blob:")),
          videos: videos.length,
          login: [...document.querySelectorAll("input[type=password]")].some(visible),
          bot: /just a moment|attention required|checking your browser|verify you are human/i.test(document.title),
        };
      })
      .catch(() => null);
    if (!s) continue;
    out.emeKeySystem ||= s.eme;
    out.blobVideo ||= s.blob;
    out.videoElements += s.videos;
    out.loginForm ||= s.login;
    out.botCheck ||= s.bot;
  }
  return out;
}

/**
 * Renders a listing page (home, category, search) with ads blocked, scrolling a little so
 * lazy-loaded posters appear. Used by Browse when the plain HTML has no movie cards.
 */
export function renderPage(url) {
  return withShieldedPage(async (page, stats) => {
    await open(page, url);
    await sleep(2_000);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5)).catch(() => {});
      await sleep(500);
    }
    return {
      html: await page.content().catch(() => ""),
      title: await page.title().catch(() => ""),
      finalUrl: page.url(),
      ...stats,
    };
  });
}

async function nudgePlayers(page) {
  for (const frame of page.frames()) {
    await frame
      .evaluate((selectors) => {
        document.querySelectorAll("video").forEach((v) => {
          v.muted = true;
          v.play?.().catch(() => {});
        });
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.click();
            break;
          }
        }
      }, PLAY_SELECTORS)
      .catch(() => {});
  }
  // Many players start on any click inside their iframe.
  const box = await largestIframeBox(page);
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).catch(() => {});
}

async function largestIframeBox(page) {
  const frames = await page.$$("iframe").catch(() => []);
  let best = null;
  for (const f of frames) {
    const box = await f.boundingBox().catch(() => null);
    if (box && box.width > 200 && box.height > 120 && (!best || box.width * box.height > best.width * best.height)) best = box;
  }
  return best;
}

async function waitForMedia(candidates, ms, minimum = 1) {
  const end = Date.now() + ms;
  while (candidates.size < minimum && Date.now() < end) await sleep(250);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  await b?.close().catch(() => {});
}

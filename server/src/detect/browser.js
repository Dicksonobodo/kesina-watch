import puppeteer from "puppeteer-core";
import { config, USER_AGENT } from "../config.js";
import { findChrome } from "../chrome.js";
import { createLimiter } from "../limits.js";
import { HttpError, isPrivateHostname } from "../safety.js";
import { getBlocker } from "./blocker.js";
import { classify } from "./media.js";

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
 * Opens the page in headless Chrome with ads blocked and records every video request.
 * Returns { html, title, candidates, adsBlocked, popupsBlocked, finalUrl }.
 */
export function browserDetect(url) {
  return runLimited(async () => {
    const [browser, blocker] = await Promise.all([getBrowser(), getBlocker().catch(() => null)]);
    const context = await browser.createBrowserContext();
    const stats = { adsBlocked: 0, popupsBlocked: 0 };
    const candidates = new Map();
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

      // Our own filter: never let the page reach private/internal addresses.
      page.on("request", (req) => {
        if (req.isInterceptResolutionHandled()) return;
        let host = "";
        try {
          host = new URL(req.url()).hostname;
        } catch {
          /* data:, blob: etc. */
        }
        if (host && isPrivateHostname(host)) req.abort("accessdenied", 1000);
        else req.continue(req.continueRequestOverrides(), 0);
      });

      if (blocker) await blocker.enableBlockingInPage(page);

      page.on("requestfailed", (req) => {
        // Chrome reports blocker aborts as "net::ERR_BLOCKED_BY_CLIENT.Inspector".
        if (req.failure()?.errorText?.startsWith("net::ERR_BLOCKED_BY_CLIENT")) stats.adsBlocked++;
      });

      page.on("response", (res) => {
        const reqUrl = res.url();
        const headers = res.headers();
        const type = classify(reqUrl, headers["content-type"]);
        if (!type || candidates.has(reqUrl)) return;
        const total = Number(headers["content-range"]?.split("/")[1]) || Number(headers["content-length"]) || null;
        candidates.set(reqUrl, {
          url: reqUrl,
          type,
          size: type === "file" ? total : null,
          referer: res.request().headers().referer || res.frame()?.url() || url,
        });
      });

      await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS }).catch((err) => {
        if (!/timeout/i.test(err.message)) throw new HttpError(502, "That page wouldn't load. It may be down or blocking us.");
      });

      // Give players a moment, then nudge them to start.
      await waitForMedia(candidates, 3_000);
      if (!candidates.size) await nudgePlayers(page);
      await waitForMedia(candidates, MEDIA_WAIT_MS);
      if (candidates.size) await sleep(1_500); // let a master playlist arrive alongside variants

      return {
        html: await page.content().catch(() => ""),
        title: await page.title().catch(() => ""),
        finalUrl: page.url(),
        candidates: [...candidates.values()],
        ...stats,
      };
    } finally {
      await context.close().catch(() => {});
    }
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

async function waitForMedia(candidates, ms) {
  const end = Date.now() + ms;
  while (!candidates.size && Date.now() < end) await sleep(250);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function closeBrowser() {
  const b = await browserPromise?.catch(() => null);
  await b?.close().catch(() => {});
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PuppeteerBlocker, Request } from "@ghostery/adblocker-puppeteer";

const CACHE_FILE = path.resolve(".cache/adblock-engine.bin");
let enginePromise = null;

// EasyList + EasyPrivacy + uBlock filters, cached on disk after the first download.
export function getBlocker() {
  enginePromise ??= (async () => {
    await mkdir(path.dirname(CACHE_FILE), { recursive: true });
    const blocker = await PuppeteerBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: CACHE_FILE,
      read: readFile,
      write: writeFile,
    });
    // Lets our own safety filter share request interception with the blocker.
    blocker.setRequestInterceptionPriority(10);
    return blocker;
  })().catch((err) => {
    enginePromise = null;
    throw err;
  });
  return enginePromise;
}

// True when a URL is a known ad/tracker (used to drop ad videos from results).
export async function isAdUrl(url, sourceUrl, type = "media") {
  try {
    const blocker = await getBlocker();
    return blocker.match(Request.fromRawDetails({ url, sourceUrl, type })).match;
  } catch {
    return false;
  }
}

// How many ad/tracker resources a page's HTML would have loaded in the user's browser.
export async function countAdResources(resources, sourceUrl) {
  const flags = await Promise.all(resources.map((r) => isAdUrl(r.url, sourceUrl, r.type)));
  return flags.filter(Boolean).length;
}

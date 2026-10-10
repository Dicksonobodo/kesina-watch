import * as cheerio from "cheerio";
import { USER_AGENT } from "./config.js";
import { getCached, setCached } from "./cache.js";
import { assertPublicUrl, HttpError } from "./safety.js";
import { isAdUrl } from "./detect/blocker.js";
import { renderPage } from "./detect/browser.js";

/*
 * Browse: reads a movie site's listing page (home, category, search results) and returns
 * just the movies as clean cards: title, poster, link. Plus next/previous page, the site's
 * search, and its main menu. Nothing from the site runs on the visitor's device, so there
 * are no ads or pop-ups to block.
 *
 * How cards are found: movie sites repeat the same "card" markup (a link wrapping a poster
 * image) dozens of times. We collect every link-with-image, group them by their markup
 * shape, and keep the big repeated groups. Logos, banners and one-off links fall away.
 */

const MIN_GROUP = 4;
// Sections that list movies rather than being one (tags, genres, people, years…).
const LISTING_PATH = /\/(tags?|subjects?|genres?|categor(y|ies)|actors?|cast|directors?|stars?|country|countries|years?|release-year|quality|page|author)\//i;
const MAX_ITEMS = 60;

const IMG_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-echo", "data-img", "data-url", "src"];

function absolute(u, base) {
  if (!u) return "";
  try {
    return new URL(u.trim(), base).href;
  } catch {
    return "";
  }
}

const siteKey = (host) => host.replace(/^www\./, "").split(".").slice(-2).join(".");

function imageOf($, el, base) {
  const img = $(el).is("img") ? $(el) : $(el).find("img").first();
  if (img.length) {
    for (const attr of IMG_ATTRS) {
      const v = img.attr(attr);
      if (v && !v.startsWith("data:")) return absolute(v, base);
    }
    const srcset = img.attr("data-srcset") || img.attr("srcset");
    if (srcset) return absolute(srcset.split(",").pop().trim().split(" ")[0], base);
  }
  // Posters drawn as CSS backgrounds.
  const styled = $(el).is("[style*='url(']") ? $(el) : $(el).find("[style*='url(']").first();
  const bg = styled.attr("style")?.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
  if (bg) return absolute(bg, base);
  for (const attr of ["data-bg", "data-background", "data-background-image"]) {
    const v = $(el).attr(attr) || $(el).find(`[${attr}]`).attr(attr);
    if (v) return absolute(v, base);
  }
  return "";
}

function clean(text) {
  return text.replace(/\s+/g, " ").replace(/^(watch|download)\s+/i, "").trim();
}

// "/movie/a-corner-in-wheat-1909" → "A Corner In Wheat 1909"
function titleFromLink(link) {
  try {
    const last = decodeURIComponent(new URL(link).pathname.split("/").filter(Boolean).pop() || "")
      .replace(/.(html?|php|aspx?)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/d{4,}(?!.*(19|20)d{2})/, "")
      .trim();
    if (last.length < 3 || /^d+$/.test(last)) return "";
    return last.replace(/w/g, (c) => c.toUpperCase());
  } catch {
    return "";
  }
}

function titleOf($, a, textByLink) {
  const el = $(a);
  const candidates = [
    el.attr("title"),
    el.find("h1,h2,h3,h4,h5,[class*='title'],[class*='name']").first().text(),
    el.find("b,strong").first().text(),
    el.find("img").first().attr("alt"),
    el.find("img").first().attr("title"),
    el.parent().find("h1,h2,h3,h4,h5,[class*='title']").first().text(),
    // First child with text: cards often stack title + description with no space between them.
    el.children().filter((_, c) => $(c).text().trim()).first().text(),
    // The title often sits in a separate link to the same movie.
    textByLink.get(absolute(el.attr("href"), "http://x/")),
    el.text(),
  ];
  for (const c of candidates) {
    const t = clean(c || "");
    if (t.length >= 2 && t.length <= 90) return t === t.toLowerCase() ? t.replace(/\b\w/g, (x) => x.toUpperCase()) : t;
  }
  return titleFromLink(absolute(el.attr("href"), "http://x/"));
}

// Inside the header, menu or footer? Checks real elements and whole class names only, stopping at
// <body>: pages often put classes like "footer-columns" on <html> itself.
const CHROME_CLASS = /^(site-|main-|top-)?(header|footer|nav|navbar|navigation|menu|logo|branding|sidebar-menu)(-|_|$)/i;
function inSiteChrome($, el) {
  for (let node = el; node.length && !["body", "html"].includes(node[0].tagName); node = node.parent()) {
    if (["header", "nav", "footer"].includes(node[0].tagName)) return true;
    const tokens = `${node.attr("class") || ""} ${node.attr("id") || ""}`.split(/s+/);
    if (tokens.some((t) => CHROME_CLASS.test(t))) return true;
  }
  return false;
}

// "Markup shape" of a card: the tag/class path of its two nearest ancestors.
function signature($, a) {
  const parts = [];
  let node = $(a);
  for (let i = 0; i < 3 && node.length; i++) {
    const cls = (node.attr("class") || "").split(/\s+/).filter((c) => c && !/\d/.test(c)).sort().slice(0, 3).join(".");
    parts.push(`${node[0].tagName}${cls ? `.${cls}` : ""}`);
    node = node.parent();
  }
  return parts.join("<");
}

function extractCards($, base) {
  const host = siteKey(new URL(base).hostname);
  const groups = new Map();

  // Text of every link, by address, to name image-only cards.
  const textByLink = new Map();
  $("a[href]").each((_, a) => {
    const text = clean($(a).find("h1,h2,h3,h4,h5,[class*='title'],b,strong").first().text() || $(a).text());
    if (text.length >= 2 && text.length <= 140) textByLink.set(absolute($(a).attr("href"), "http://x/"), text);
  });

  $("a[href]").each((_, a) => {
    const el = $(a);
    if (inSiteChrome($, el)) return;
    const link = absolute(el.attr("href"), base);
    if (!link.startsWith("http") || link.split("#")[0] === base.split("#")[0]) return;
    let linkHost;
    try {
      linkHost = siteKey(new URL(link).hostname);
    } catch {
      return;
    }
    if (linkHost !== host) return; // movie pages live on the same site; other links are usually ads
    if (LISTING_PATH.test(new URL(link).pathname)) return; // tag / genre / actor pages, not movies
    let poster = imageOf($, a, base);
    // Some cards keep the image beside the link: use the nearest wrapper holding exactly one image.
    if (!poster) {
      let node = el.parent();
      for (let i = 0; i < 4 && node.length && node[0].tagName !== "body"; i++, node = node.parent()) {
        const count = node.find("img").length;
        if (count === 1) {
          poster = imageOf($, node.get(0), base);
          break;
        }
        if (count > 1) break; // too wide: that's the whole grid, not this card
      }
    }
    if (!poster || /logo|icon|avatar|sprite|placeholder|blank\.|spacer|pixel/i.test(poster)) return;
    const title = titleOf($, a, textByLink);
    if (!title) return;

    const sig = signature($, a);
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push({ title, poster, link });
  });

  const seen = new Set();
  return [...groups.values()]
    .filter((g) => g.length >= MIN_GROUP)
    // Real movie cards have their own posters; groups that mostly reuse one image are icons or tags.
    // (Counted per distinct movie: cards often link the same movie twice, title and image.)
    .filter((g) => new Set(g.map((i) => i.poster)).size >= new Set(g.map((i) => i.link)).size * 0.6)
    .sort((a, b) => b.length - a.length)
    .flat()
    .filter((item) => {
      const key = item.link.replace(/[?#].*$/, "").replace(/\/$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const year = item.title.match(/\b(19[3-9]\d|20[0-4]\d)\b/)?.[1];
      const quality = item.title.match(/\b(4K|2160p|1080p|720p|HD|CAM|TS)\b/i)?.[1];
      return {
        ...item,
        title: item.title.replace(/\s*[([]?(19[3-9]\d|20[0-4]\d)[)\]]?\s*/, " ").replace(/\b(4K|2160p|1080p|720p|HDRip|WEBRip|BluRay)\b/gi, "").replace(/\s{2,}/g, " ").trim(),
        year: year ? Number(year) : null,
        badge: quality?.toUpperCase() ?? null,
      };
    });
}

function extractPaging($, base) {
  const find = (selectors, words) => {
    for (const sel of selectors) {
      const href = $(sel).first().attr("href");
      if (href) return absolute(href, base);
    }
    let found = "";
    $("a[href]").each((_, a) => {
      const t = $(a).text().trim().toLowerCase();
      const label = ($(a).attr("aria-label") || $(a).attr("title") || "").toLowerCase();
      if (words.some((w) => t === w || label.includes(w))) {
        found = absolute($(a).attr("href"), base);
        return false;
      }
    });
    return found;
  };
  const next = find(["link[rel=next]", "a[rel=next]", "a.next", ".pagination .next a", ".nav-previous a", "a.nextpostslink"], ["next", "next page", "»", "›", ">", "older posts"]);
  const prev = find(["link[rel=prev]", "a[rel=prev]", "a.prev", ".pagination .prev a", "a.previouspostslink"], ["previous", "prev", "«", "‹", "<", "newer posts"]);
  return { next: next && next !== base ? next : null, prev: prev && prev !== base ? prev : null };
}

// The site's own search, as a URL template with {q}.
function extractSearch($, base) {
  const input = $("form input[type=search], form input[name=s], form input[name=q], form input[name=keyword], form input[name=query], form input[name=search]").first();
  if (input.length) {
    const form = input.closest("form");
    const method = (form.attr("method") || "get").toLowerCase();
    if (method === "get") {
      const action = absolute(form.attr("action") || "/", base) || new URL("/", base).href;
      const url = new URL(action);
      form.find("input[type=hidden][name]").each((_, h) => url.searchParams.set($(h).attr("name"), $(h).attr("value") || ""));
      url.searchParams.set(input.attr("name") || "s", "__Q__");
      return url.href.replace("__Q__", "{q}");
    }
  }
  // Most movie sites run WordPress, whose search is always ?s=
  if ($("link[href*='wp-content'], script[src*='wp-content'], meta[name=generator][content*='WordPress']").length) {
    return `${new URL("/", base).href}?s={q}`;
  }
  return null;
}

function extractMenu($, base, cardLinks) {
  const host = siteKey(new URL(base).hostname);
  const items = [];
  const seen = new Set([new URL("/", base).href]);
  $("nav a[href], header a[href], [class*='menu'] a[href]").each((_, a) => {
    const label = $(a).text().replace(/\s+/g, " ").trim();
    const link = absolute($(a).attr("href"), base);
    if (!label || label.length > 24 || !link.startsWith("http") || seen.has(link) || cardLinks.has(link)) return;
    try {
      if (siteKey(new URL(link).hostname) !== host) return;
    } catch {
      return;
    }
    if (/login|sign ?in|register|contact|dmca|privacy|terms|about|faq|request|telegram|discord|app/i.test(label)) return;
    seen.add(link);
    items.push({ label, link });
  });
  return items.slice(0, 14);
}

function readListing(html, base) {
  const $ = cheerio.load(html);
  const items = extractCards($, base);
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() ||
    $("title").text().split(/[|\-–—:]/).pop().trim() ||
    new URL(base).hostname.replace(/^www\./, "");
  return {
    siteName: siteName.slice(0, 40),
    pageTitle: $("title").text().replace(/\s+/g, " ").trim().slice(0, 120),
    items,
    ...extractPaging($, base),
    search: extractSearch($, base),
    menu: extractMenu($, base, new Set(items.map((i) => i.link))),
    looksBlocked: /just a moment|attention required|checking your browser|enable javascript/i.test($("title").text()),
  };
}

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok || !(res.headers.get("content-type") || "").includes("html")) return null;
    return { html: await res.text(), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

const inFlight = new Map();

/** Reads one listing page of a movie site. Several visitors opening the same page share one read. */
export async function browse(rawUrl) {
  const url = (await assertPublicUrl(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)).href;
  const cached = getCached(`browse:${url}`);
  if (cached) return cached;
  if (inFlight.has(url)) return inFlight.get(url);
  const work = readSite(url).finally(() => inFlight.delete(url));
  inFlight.set(url, work);
  return work;
}

async function readSite(url) {
  let engine = "light";
  let listing = null;
  let finalUrl = url;
  let adsBlocked = 0;

  const plain = await fetchHtml(url);
  if (plain) {
    finalUrl = plain.finalUrl;
    listing = readListing(plain.html, finalUrl);
  }
  // Script-built pages, lazy grids or bot checks: render it in Chrome with ads blocked.
  if (!listing || listing.items.length < 6 || listing.looksBlocked) {
    engine = "browser";
    const page = await renderPage(url);
    finalUrl = page.finalUrl;
    adsBlocked = page.adsBlocked;
    const rendered = readListing(page.html, finalUrl);
    if (!listing || rendered.items.length >= listing.items.length) listing = rendered;
  }
  if (!listing.items.length) {
    throw new HttpError(422, listing.looksBlocked ? "This site blocks automated visitors, so it can't be browsed here." : "We couldn't find a movie list on that page. Try the site's Movies or Home page.");
  }

  // Drop anything the ad lists know about (sponsored "movies" that are really ads).
  const flags = await Promise.all(listing.items.map((i) => isAdUrl(i.link, finalUrl, "document")));
  listing.items = listing.items
    .filter((_, i) => !flags[i])
    // Our site is https: upgrade plain-http posters so browsers load them.
    .map((item) => ({ ...item, poster: item.poster.replace(/^http:\/\//, "https://") }));

  const result = {
    url: finalUrl,
    site: new URL(finalUrl).hostname.replace(/^www\./, ""),
    ...listing,
    adsBlocked,
    engine,
  };
  delete result.looksBlocked;
  setCached(`browse:${url}`, result);
  return result;
}

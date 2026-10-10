import * as cheerio from "cheerio";

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>\\()]+?\.(?:mp4|m3u8|webm|mov|mkv)(?:\?[^\s"'<>\\()]*)?/gi;

// Words movie sites stuff into page titles.
const TITLE_NOISE =
  /\b(watch|online|free|full\s*movie|movie|hd|hdrip|webrip|web-dl|bluray|download|stream(?:ing)?|subtitles?|eng(?:lish)?\s*sub|1080p|720p|480p|4k)\b/gi;

export function extractMetadata(html, pageUrl) {
  const $ = cheerio.load(html);
  const meta = (sel) => $(sel).attr("content")?.trim() || "";
  const ld = readJsonLd($);

  // The first title that isn't just the site's own name (logos are often the page's <h1>).
  const host = (() => {
    try {
      return new URL(pageUrl).hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
    } catch {
      return "";
    }
  })();
  const titleTag = $("title").text().trim();
  const siteNames = [meta('meta[property="og:site_name"]'), titleTag.split(/s+[|–—]s+|s+-s+/).pop()]
    .filter((n) => n && n !== titleTag)
    .map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ""));
  const isSiteName = (t) => {
    const c = cleanTitle(t).toLowerCase();
    const squashed = c.replace(/[^a-z0-9]/g, "");
    const h = host.replace(/[^a-z0-9]/g, "");
    return !c || siteNames.includes(squashed) || (h.length > 3 && (squashed.includes(h) || h.includes(squashed)));
  };
  const rawTitle =
    [
      ld.name,
      meta('meta[property="og:title"]'),
      meta('meta[name="twitter:title"]'),
      titleTag, // "Movie Name | Site": cleanTitle keeps the movie part
      ...$("h1")
        .slice(0, 3)
        .map((_, h) => $(h).text().trim())
        .get(),
    ].find((t) => t && !isSiteName(t)) || $("title").text().trim();

  const poster = absolute(
    imageOf(ld.image) ||
      meta('meta[property="og:image"]') ||
      meta('meta[name="twitter:image"]') ||
      $("video[poster]").attr("poster") ||
      "",
    pageUrl,
  );

  const year =
    Number(String(ld.datePublished || ld.dateCreated || "").slice(0, 4)) ||
    Number(rawTitle.match(/\b(19[2-9]\d|20[0-4]\d)\b/)?.[1]) ||
    null;

  return {
    title: cleanTitle(rawTitle) || "Untitled",
    year: year || null,
    poster: poster || null,
    runtime: isoDurationToMinutes(ld.duration),
    candidates: extractCandidates($, html, pageUrl, ld),
    resources: extractResources($, pageUrl),
    subtitles: extractSubtitles($, html, pageUrl),
  };
}

// Subtitle files: <track> elements and .vtt / .srt links in player configs.
const SUB_URL_RE = /https?:\/\/[^\s"'<>\\()]+?\.(?:vtt|srt)(?:\?[^\s"'<>\\()]*)?/gi;

function extractSubtitles($, html, pageUrl) {
  const found = new Map();
  $("track[src]").each((_, el) => {
    const kind = ($(el).attr("kind") || "subtitles").toLowerCase();
    if (kind !== "subtitles" && kind !== "captions") return;
    const url = absolute($(el).attr("src"), pageUrl);
    if (url.startsWith("http")) found.set(url, { url, lang: $(el).attr("srclang") || "", label: $(el).attr("label") || $(el).attr("srclang") || "Subtitles" });
  });
  for (const match of html.replace(/\\\//g, "/").matchAll(SUB_URL_RE)) {
    if (!found.has(match[0])) {
      const lang = match[0].match(/[._-](en|eng|fr|es|de|pt|it|ar|yo|ig|ha)[._-]/i)?.[1] || "";
      found.set(match[0], { url: match[0], lang, label: lang ? lang.toUpperCase() : "Subtitles" });
    }
  }
  return [...found.values()];
}

// Scripts, frames and images the page would load: used to count the ads it carries.
function extractResources($, pageUrl) {
  const out = [];
  const collect = (selector, attr, type) =>
    $(selector).each((_, el) => {
      const url = absolute($(el).attr(attr), pageUrl);
      if (url.startsWith("http")) out.push({ url, type });
    });
  collect("script[src]", "src", "script");
  collect("iframe[src]", "src", "sub_frame");
  collect("img[src]", "src", "image");
  collect("link[rel='stylesheet'][href]", "href", "stylesheet");
  return out;
}

function extractCandidates($, html, pageUrl, ld) {
  const found = new Set();
  const add = (u) => {
    const abs = absolute(u, pageUrl);
    if (abs.startsWith("http")) found.add(abs);
  };

  $("video[src], video source[src], source[type^='video'], source[type*='mpegurl']").each((_, el) => add($(el).attr("src")));
  add(meta($, 'meta[property="og:video"]'));
  add(meta($, 'meta[property="og:video:url"]'));
  add(meta($, 'meta[property="og:video:secure_url"]'));
  if (ld.contentUrl) add(ld.contentUrl);

  // Links buried in player config scripts, including JSON-escaped ones (https:\/\/...)
  const text = html.replace(/\\\//g, "/").replace(/\\u0026/gi, "&");
  for (const m of text.matchAll(MEDIA_URL_RE)) add(m[0]);

  // Relative video paths in player settings, e.g. "path":"/movie.php?id=…&type=.mp4"
  for (const m of text.matchAll(/["'](\/[^"'\s<>]{1,300}?\.(?:mp4|m3u8|webm|mkv|mov)\b[^"'\s<>]{0,200})["']/gi)) add(m[1]);

  // "Download" style links whose address carries a video extension anywhere (often a redirect script).
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (/\.(mp4|m3u8|webm|mkv|mov)(\b|$)/i.test(href)) add(href);
  });

  return [...found].filter((u) => !/\.(ts|m4s)(\?|$)/i.test(u));
}

function meta($, sel) {
  return $(sel).attr("content")?.trim() || "";
}

function readJsonLd($) {
  const out = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text());
      const items = [data, ...(data["@graph"] || [])].flat();
      for (const item of items) {
        const type = [].concat(item?.["@type"] || []).join(" ");
        if (/Movie|VideoObject|TVEpisode|Episode/i.test(type)) {
          for (const k of ["name", "image", "datePublished", "dateCreated", "duration", "contentUrl", "thumbnailUrl"]) {
            out[k] ??= item[k];
          }
          out.image ??= item.thumbnailUrl;
        }
      }
    } catch {
      /* broken JSON-LD is common, ignore */
    }
  });
  return out;
}

function imageOf(image) {
  if (!image) return "";
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return imageOf(image[0]);
  return image.url || image.contentUrl || "";
}

export function absolute(u, base) {
  if (!u) return "";
  try {
    return new URL(u.trim(), base).href;
  } catch {
    return "";
  }
}

export function cleanTitle(raw) {
  if (!raw) return "";
  // "Movie (2024) | Site", "Movie : Free Download : Archive", "Movie »" → first meaningful part
  const parts = raw.split(/\s+[|–—:»«]\s*|\s+-\s+/);
  for (const part of parts) {
    const t = part
      .replace(/\((19|20)\d{2}\)|\b(19|20)\d{2}\b/g, " ")
      .replace(TITLE_NOISE, " ")
      .replace(/[,;]\s*(?=[,;]|$)/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s:\-–|,»«]+|[\s:\-–|,»«]+$/g, "")
      .trim();
    if (t.length > 1) return t;
  }
  return "";
}

export function isoDurationToMinutes(iso) {
  const m = String(iso || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return null;
  const mins = Number(m[1] || 0) * 60 + Number(m[2] || 0) + Math.round(Number(m[3] || 0) / 60);
  return mins || null;
}

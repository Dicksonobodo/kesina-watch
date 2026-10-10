import * as cheerio from "cheerio";
import { cached, getJson, USER_AGENT } from "./sports.js";

/*
 * Football news: BBC Sport and Sky Sports (RSS) plus ESPN (JSON API, which includes photos).
 * Stories still missing a picture get the article's own share image (og:image).
 */

const RSS_FEEDS = [
  { source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { source: "Sky Sports", url: "https://www.skysports.com/rss/11095" },
];
const ESPN_NEWS_LEAGUES = ["eng.1", "uefa.champions", "esp.1"];

// RSS dates can use zone names like "BST" that JavaScript can't read; one bad date must never drop a feed.
function safeDate(value) {
  const fixed = String(value || "")
    .replace(/\bBST\b/, "+0100")
    .replace(/\bCEST\b/, "+0200")
    .replace(/\bCET\b/, "+0100");
  const d = new Date(fixed);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function bigImage(url) {
  if (!url) return null;
  return url
    .replace(/\/standard\/\d+\//, "/standard/800/") // BBC thumbnails → 800px wide
    .replace(/\/\d{3,4}x\d{3,4}\//, "/768x432/"); // Sky 1920x1080 → lighter 768x432
}

async function readRss(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${feed.source}`);
  const $ = cheerio.load(await res.text(), { xmlMode: true });
  return $("item")
    .map((_, el) => {
      const item = $(el);
      const link = item.find("link").text().trim();
      return {
        id: link,
        title: item.find("title").text().trim(),
        summary: item
          .find("description")
          .text()
          .replace(/<[^>]+>/g, "")
          .replace(/&#160;/g, " ")
          .trim()
          .slice(0, 220),
        link,
        image: bigImage(
          item.find("media\\:thumbnail").attr("url") ||
            item.find("media\\:content").attr("url") ||
            item.find("enclosure[type^='image']").attr("url") ||
            null,
        ),
        published: safeDate(item.find("pubDate").text()),
        source: feed.source,
      };
    })
    .get()
    .filter((n) => n.title && n.link.startsWith("http") && !/\/(rugby|cricket|f1|tennis|golf|boxing)/.test(n.link));
}

async function readEspnNews(league) {
  const data = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/news?limit=15`);
  return (data.articles ?? [])
    .filter((a) => a.links?.web?.href && a.type !== "Media")
    .map((a) => ({
      id: a.links.web.href,
      title: a.headline ?? "",
      summary: (a.description ?? "").slice(0, 220),
      link: a.links.web.href,
      image: a.images?.find((i) => i.url && !/\.gif/i.test(i.url))?.url ?? null,
      published: safeDate(a.published),
      source: "ESPN",
    }));
}

// Last resort for a missing picture: the article's own share image.
const ogCache = new Map();
async function articleImage(link) {
  if (ogCache.has(link)) return ogCache.get(link);
  let image = null;
  try {
    const res = await fetch(link, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: AbortSignal.timeout(4_000) });
    if (res.ok) {
      const $ = cheerio.load((await res.text()).slice(0, 200_000));
      image = $('meta[property="og:image"]').attr("content") || $('meta[name="twitter:image"]').attr("content") || null;
      if (image && !/^https?:/.test(image)) image = new URL(image, link).href;
    }
  } catch {
    /* keep null: the card shows a designed placeholder */
  }
  if (ogCache.size > 500) ogCache.delete(ogCache.keys().next().value);
  ogCache.set(link, image);
  return image;
}

export async function getNews() {
  return cached("news", 10 * 60_000, async () => {
    const results = await Promise.allSettled([...RSS_FEEDS.map(readRss), ...ESPN_NEWS_LEAGUES.map(readEspnNews)]);
    const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!items.length) throw new Error("all news feeds failed");

    const seen = new Set();
    const unique = items.filter((n) => {
      const key = n.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").slice(0, 60);
      if (seen.has(key) || seen.has(n.link)) return false;
      seen.add(key);
      seen.add(n.link);
      return true;
    });
    unique.sort((a, b) => new Date(b.published) - new Date(a.published));
    const top = unique.slice(0, 40);

    // Fill missing pictures from the articles themselves, five at a time.
    const missing = top.filter((n) => !n.image).slice(0, 15);
    for (let i = 0; i < missing.length; i += 5) {
      await Promise.all(missing.slice(i, i + 5).map(async (n) => (n.image = await articleImage(n.link))));
    }
    return { value: top };
  });
}

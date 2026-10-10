import * as cheerio from "cheerio";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const log = { warn: (msg, fields) => console.warn(JSON.stringify({ level: "warn", msg, ...fields, error: fields?.error?.message })) };

/*
 * Sports data for the Sports tab: fixtures, live scores and results (ESPN's public scoreboard
 * feed, no key needed) and football news (official RSS feeds). Everything is cached here so
 * thousands of visitors cost the sources a handful of requests per minute.
 *
 * Runs as Vercel functions (api/sports/*), so Sports works even when the detection server is off.
 * Vercel's CDN caches the responses too (see Cache-Control in the route files).
 */

export const LEAGUES = [
  { id: "eng.1", name: "Premier League", short: "EPL" },
  { id: "uefa.champions", name: "Champions League", short: "UCL" },
  { id: "esp.1", name: "LaLiga", short: "LaLiga" },
  { id: "ita.1", name: "Serie A", short: "Serie A" },
  { id: "ger.1", name: "Bundesliga", short: "Bundesliga" },
  { id: "fra.1", name: "Ligue 1", short: "Ligue 1" },
  { id: "uefa.europa", name: "Europa League", short: "UEL" },
  { id: "fifa.world", name: "World Cup", short: "World Cup" },
];

const NEWS_FEEDS = [
  { source: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/rss.xml" },
  { source: "Sky Sports", url: "https://www.skysports.com/rss/12040" },
  { source: "ESPN", url: "https://www.espn.com/espn/rss/soccer/news" },
];

const cache = new Map(); // key → { at, ttl, value, pending }

// Serves cached data; refreshes in the background when stale, and keeps the last good copy if a source fails.
async function cached(key, ttlMs, load) {
  const hit = cache.get(key);
  const fresh = hit && Date.now() - hit.at < hit.ttl;
  if (fresh) return hit.value;
  if (hit?.pending) return hit.value ?? hit.pending;
  const pending = load()
    .then(({ value, ttl = ttlMs }) => {
      cache.set(key, { at: Date.now(), ttl, value });
      return value;
    })
    .catch((err) => {
      log.warn("sports source failed", { key, error: err });
      if (hit?.value) {
        cache.set(key, { ...hit, at: Date.now(), ttl: 60_000 });
        return hit.value;
      }
      throw err;
    });
  cache.set(key, { ...(hit ?? {}), pending });
  return hit?.value ?? pending;
}

async function getJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  return res.json();
}

/* ---------- matches ---------- */

function yyyymmdd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function mapEvent(e, league) {
  const c = e.competitions?.[0] ?? {};
  const team = (side) => {
    const t = c.competitors?.find((x) => x.homeAway === side) ?? {};
    return {
      name: t.team?.displayName ?? "TBD",
      short: t.team?.shortDisplayName ?? t.team?.displayName ?? "TBD",
      abbr: t.team?.abbreviation ?? "",
      logo: t.team?.logo ?? null,
      score: t.score ?? null,
      winner: Boolean(t.winner),
      form: t.form ?? null,
    };
  };
  const status = e.status?.type ?? {};
  return {
    id: e.id,
    league: league.id,
    leagueName: league.name,
    kickoff: e.date,
    state: status.state ?? "pre", // pre | in | post
    clock: e.status?.displayClock ?? null,
    detail: status.shortDetail ?? status.detail ?? "",
    home: team("home"),
    away: team("away"),
    venue: c.venue?.fullName ?? null,
    // Official broadcasters (where to watch). ESPN lists them for the US market.
    broadcasters: [...new Set((c.broadcasts ?? []).flatMap((b) => b.names ?? []))].slice(0, 4),
    link: e.links?.find((l) => l.rel?.includes("summary"))?.href ?? null,
  };
}

async function leagueDay(league, dateKey) {
  return cached(`matches:${league.id}:${dateKey}`, 10 * 60_000, async () => {
    const data = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${dateKey}`);
    const matches = (data.events ?? []).map((e) => mapEvent(e, league));
    const live = matches.some((m) => m.state === "in");
    const soon = matches.some((m) => m.state === "pre" && new Date(m.kickoff) - Date.now() < 30 * 60_000);
    // Live matches refresh every 30s; quiet days every 10 minutes.
    return { value: matches, ttl: live || soon ? 30_000 : 10 * 60_000 };
  });
}

/** Matches for a day (offset from today: -1 yesterday, 0 today, 1 tomorrow …) across leagues. */
export async function getMatches({ day = 0, league } = {}) {
  const date = new Date(Date.now() + day * 86_400_000);
  const dateKey = yyyymmdd(date);
  const leagues = league ? LEAGUES.filter((l) => l.id === league) : LEAGUES;
  const results = await Promise.allSettled(leagues.map((l) => leagueDay(l, dateKey)));
  const matches = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const order = { in: 0, pre: 1, post: 2 };
  matches.sort((a, b) => order[a.state] - order[b.state] || new Date(a.kickoff) - new Date(b.kickoff));
  return { date: date.toISOString().slice(0, 10), leagues: LEAGUES, matches, live: matches.filter((m) => m.state === "in").length };
}

/* ---------- news ---------- */

function bigImage(url) {
  if (!url) return null;
  return url.replace(/\/standard\/\d+\//, "/standard/800/").replace(/\/(\d{3})x(\d{3})\//, "/768x432/");
}

async function readFeed(feed) {
  const res = await fetch(feed.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${feed.source}`);
  const $ = cheerio.load(await res.text(), { xmlMode: true });
  return $("item")
    .map((_, el) => {
      const item = $(el);
      const image =
        item.find("media\\:thumbnail").attr("url") ||
        item.find("media\\:content").attr("url") ||
        item.find("enclosure[type^='image']").attr("url") ||
        null;
      const link = item.find("link").text().trim();
      return {
        id: link,
        title: item.find("title").text().trim(),
        summary: item.find("description").text().replace(/<[^>]+>/g, "").trim().slice(0, 220),
        link,
        image: bigImage(image),
        published: new Date(item.find("pubDate").text() || Date.now()).toISOString(),
        source: feed.source,
      };
    })
    .get()
    .filter((n) => n.title && n.link.startsWith("http"));
}

export async function getNews() {
  return cached("news", 10 * 60_000, async () => {
    const results = await Promise.allSettled(NEWS_FEEDS.map(readFeed));
    const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!items.length) throw new Error("all news feeds failed");
    const seen = new Set();
    const unique = items.filter((n) => {
      const key = n.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => new Date(b.published) - new Date(a.published));
    return { value: unique.slice(0, 40) };
  });
}

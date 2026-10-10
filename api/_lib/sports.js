import * as cheerio from "cheerio";
export const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
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

const cache = new Map(); // key → { at, ttl, value, pending }

// Serves cached data; refreshes in the background when stale, and keeps the last good copy if a source fails.
export async function cached(key, ttlMs, load) {
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

export async function getJson(url) {
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
  const homeId = c.competitors?.find((x) => x.homeAway === "home")?.team?.id;
  // Goal scorers and red cards, shown under the score in the fixtures list.
  const moments = (c.details ?? [])
    .filter((d) => d.scoringPlay || d.redCard)
    .map((d) => ({
      kind: d.scoringPlay ? "goal" : "red",
      side: d.team?.id === homeId ? "home" : "away",
      player: d.athletesInvolved?.[0]?.shortName ?? d.athletesInvolved?.[0]?.displayName ?? "",
      clock: d.clock?.displayValue ?? "",
      penalty: Boolean(d.penaltyKick),
      ownGoal: Boolean(d.ownGoal),
    }));
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
    moments,
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


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

/*
 * Everything the Sports tab can show. `path` is ESPN's sport/league path; `sport` groups them
 * into tabs. Team sports share one shape (home/away, score), so one code path handles all.
 */
export const SPORTS = [
  { id: "football", name: "Football", espn: "soccer" },
  { id: "basketball", name: "Basketball", espn: "basketball" },
  { id: "american-football", name: "American football", espn: "football" },
  { id: "baseball", name: "Baseball", espn: "baseball" },
  { id: "hockey", name: "Ice hockey", espn: "hockey" },
];

const fb = (id, name, short, region) => ({ id, name, short, sport: "football", path: `soccer/${id}`, region });
export const LEAGUES = [
  fb("eng.1", "Premier League", "EPL", "England"),
  fb("uefa.champions", "Champions League", "UCL", "Europe"),
  fb("esp.1", "LaLiga", "LaLiga", "Spain"),
  fb("ita.1", "Serie A", "Serie A", "Italy"),
  fb("ger.1", "Bundesliga", "Bundesliga", "Germany"),
  fb("fra.1", "Ligue 1", "Ligue 1", "France"),
  fb("uefa.europa", "Europa League", "UEL", "Europe"),
  fb("uefa.europa.conf", "Conference League", "UECL", "Europe"),
  fb("fifa.world", "World Cup", "World Cup", "World"),
  fb("nga.1", "Nigerian Professional League", "NPFL", "Nigeria"),
  fb("caf.nations", "Africa Cup of Nations", "AFCON", "Africa"),
  fb("rsa.1", "South African Premiership", "PSL", "South Africa"),
  fb("ken.1", "Kenyan Premier League", "KPL", "Kenya"),
  fb("gha.1", "Ghanaian Premier League", "GPL", "Ghana"),
  fb("ned.1", "Eredivisie", "Eredivisie", "Netherlands"),
  fb("por.1", "Primeira Liga", "Liga PT", "Portugal"),
  fb("sco.1", "Scottish Premiership", "SPFL", "Scotland"),
  fb("tur.1", "Süper Lig", "Süper Lig", "Turkey"),
  fb("usa.1", "MLS", "MLS", "USA"),
  fb("bra.1", "Brasileirão Série A", "Brasileirão", "Brazil"),
  fb("arg.1", "Liga Profesional", "Argentina", "Argentina"),
  fb("mex.1", "Liga MX", "Liga MX", "Mexico"),
  fb("eng.fa", "FA Cup", "FA Cup", "England"),
  fb("eng.league_cup", "Carabao Cup", "EFL Cup", "England"),
  fb("esp.copa_del_rey", "Copa del Rey", "Copa", "Spain"),
  fb("ger.dfb_pokal", "DFB-Pokal", "DFB", "Germany"),
  fb("ita.coppa_italia", "Coppa Italia", "Coppa", "Italy"),
  fb("fra.coupe_de_france", "Coupe de France", "CdF", "France"),
  fb("uefa.nations", "Nations League", "UNL", "Europe"),
  fb("uefa.euro", "European Championship", "Euro", "Europe"),
  fb("conmebol.libertadores", "Copa Libertadores", "Libertadores", "South America"),
  fb("conmebol.america", "Copa América", "Copa América", "South America"),
  fb("concacaf.champions", "Concacaf Champions Cup", "CCC", "North America"),
  fb("fifa.cwc", "Club World Cup", "CWC", "World"),
  fb("fifa.friendly", "International Friendlies", "Friendlies", "World"),
  { id: "nba", name: "NBA", short: "NBA", sport: "basketball", path: "basketball/nba", region: "USA" },
  { id: "wnba", name: "WNBA", short: "WNBA", sport: "basketball", path: "basketball/wnba", region: "USA" },
  { id: "nfl", name: "NFL", short: "NFL", sport: "american-football", path: "football/nfl", region: "USA" },
  { id: "mlb", name: "MLB", short: "MLB", sport: "baseball", path: "baseball/mlb", region: "USA" },
  { id: "nhl", name: "NHL", short: "NHL", sport: "hockey", path: "hockey/nhl", region: "USA" },
];

export const leagueById = (id) => LEAGUES.find((l) => l.id === id);
/** ESPN path for a league id, or null when it isn't one we serve. */
export const pathOf = (id) => leagueById(id)?.path ?? null;
export const isFootball = (id) => leagueById(id)?.sport === "football";

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
        cache.set(key, { ...hit, at: Date.now(), ttl: 60_000, pending: undefined });
        return hit.value;
      }
      cache.delete(key); // a first failure must not stick: the next request tries again
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

export function yyyymmdd(date) {
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
    sport: league.sport,
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

export async function leagueDay(league, dateKey) {
  return cached(`matches:${league.id}:${dateKey}`, 10 * 60_000, async () => {
    const data = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${league.path}/scoreboard?dates=${dateKey}`);
    const matches = (data.events ?? []).map((e) => mapEvent(e, league));
    const live = matches.some((m) => m.state === "in");
    const soon = matches.some((m) => m.state === "pre" && new Date(m.kickoff) - Date.now() < 30 * 60_000);
    // Live matches refresh every 30s; quiet days every 10 minutes.
    return { value: matches, ttl: live || soon ? 30_000 : 10 * 60_000 };
  });
}

/** Matches for a day (offset from today: -1 yesterday, 0 today, 1 tomorrow …) in one sport or league. */
export async function getMatches({ day = 0, league, sport = "football" } = {}) {
  const date = new Date(Date.now() + day * 86_400_000);
  const dateKey = yyyymmdd(date);
  const inSport = LEAGUES.filter((l) => l.sport === sport);
  const leagues = league ? LEAGUES.filter((l) => l.id === league) : inSport;
  const results = await Promise.allSettled(leagues.map((l) => leagueDay(l, dateKey)));
  const matches = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const order = { in: 0, pre: 1, post: 2 };
  matches.sort((a, b) => order[a.state] - order[b.state] || new Date(a.kickoff) - new Date(b.kickoff));
  // Leagues that have games on this day, so the picker can show counts.
  const counts = new Map();
  for (const m of matches) counts.set(m.league, (counts.get(m.league) ?? 0) + 1);
  return {
    date: date.toISOString().slice(0, 10),
    sports: SPORTS,
    sport,
    leagues: inSport.map((l) => ({ id: l.id, name: l.name, short: l.short, region: l.region, count: counts.get(l.id) ?? 0 })),
    matches,
    live: matches.filter((m) => m.state === "in").length,
  };
}

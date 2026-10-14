import { cached } from "../sports.js";
import { getLeaders } from "../football.js";
import { getStandings } from "../standings.js";
import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { setBoardScore } from "./leaderboard.js";
import { GameError, newId, rateLimit } from "./util.js";

/*
 * Higher or Lower: two players (or two clubs) and one number from this season. Is the second one
 * higher or lower than the first? One wrong answer ends the run. The numbers are live (goals and
 * assists counted from real matches, league tables), and the pairs get closer the longer you last.
 */

const LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];

const METRICS = {
  goals: { type: "player", label: "league goals this season" },
  assists: { type: "player", label: "league assists this season" },
  contributions: { type: "player", label: "goals + assists this season" },
  points: { type: "team", label: "league points" },
  goalsFor: { type: "team", label: "league goals scored" },
  goalsAgainst: { type: "team", label: "league goals conceded" },
  wins: { type: "team", label: "league wins" },
};
const byType = (type) => Object.keys(METRICS).filter((k) => METRICS[k].type === type);

/** Everyone we can ask about, with their numbers. Cached for a few minutes. */
const pool = () =>
  cached("games:hilo:pool", 10 * 60_000, async () => {
    const players = [];
    const teams = [];
    await Promise.all(
      LEAGUES.map(async (league) => {
        const [leaders, table] = await Promise.all([getLeaders(league).catch(() => null), getStandings(league).catch(() => null)]);
        for (const p of leaders?.contributions ?? []) {
          if (p.id) players.push({ type: "player", id: `p${p.id}`, name: p.name, sub: p.team, logo: p.teamLogo, goals: p.goals, assists: p.assists, contributions: p.value });
        }
        if (table) {
          const col = (key) => table.columns.findIndex((c) => c.key === key);
          const [pts, gf, ga, w] = ["points", "pointsFor", "pointsAgainst", "wins"].map(col);
          for (const r of table.groups.flatMap((g) => g.rows)) {
            const n = (i) => (i >= 0 ? Number(r.values[i]) : NaN);
            teams.push({ type: "team", id: `t${r.teamId}`, name: r.team, sub: leaderName(league), logo: r.logo, points: n(pts), goalsFor: n(gf), goalsAgainst: n(ga), wins: n(w) });
          }
        }
      }),
    );
    if (players.length < 20 || teams.length < 10) throw new Error("hilo pool unavailable");
    return { value: { player: players, team: teams } };
  });

const leaderName = (league) => ({ "eng.1": "Premier League", "esp.1": "La Liga", "ita.1": "Serie A", "ger.1": "Bundesliga", "fra.1": "Ligue 1" })[league] ?? league;

const valueOf = (item, metric) => Number(item[metric]);
const show = (item) => ({ id: item.id, type: item.type, name: item.name, sub: item.sub, logo: item.logo });

/** The next opponent for `cur`: random at first, closer in value as the streak grows. */
function pickNext(items, cur, metric, streak, avoid) {
  const c = valueOf(cur, metric);
  const options = items
    .filter((i) => i.id !== cur.id && !avoid.has(i.id) && Number.isFinite(valueOf(i, metric)) && valueOf(i, metric) !== c)
    .sort((a, b) => Math.abs(valueOf(a, metric) - c) - Math.abs(valueOf(b, metric) - c));
  if (!options.length) return null;
  const reach = Math.max(0.12, 1 - streak / 14); // share of options considered: all of them at 0, the closest 12% from streak 13
  return options[Math.floor(Math.random() * Math.max(1, Math.ceil(options.length * reach)))];
}

async function nextRound(items, cur, streak, avoid) {
  const metrics = byType(cur.type).filter((m) => Number.isFinite(valueOf(cur, m)));
  for (let tries = 0; tries < 6; tries++) {
    const metric = metrics[Math.floor(Math.random() * metrics.length)];
    const next = pickNext(items[cur.type], cur, metric, streak, avoid);
    if (next) return { metric, next };
  }
  return null;
}

const publicRound = (s) => ({
  session: s.id,
  streak: s.streak,
  metric: { key: s.metric, label: METRICS[s.metric].label },
  cur: { ...show(s.cur), value: valueOf(s.cur, s.metric) },
  next: show(s.next),
});

const recent = new Map(); // sessions this server instance just wrote: saves a database read per answer

export async function startHilo(identity) {
  rateLimit(`hilo:${identity.uid}`, 20);
  const items = await pool().catch(() => null);
  if (!items) throw new GameError("The numbers aren't available right now. Try again in a minute.", 503);
  const type = Math.random() < 0.7 ? "player" : "team";
  const cur = items[type][Math.floor(Math.random() * items[type].length)];
  const round = await nextRound(items, cur, 0, new Set([cur.id]));
  if (!round) throw new GameError("Couldn't set up a round. Try again.", 503);
  const s = { id: newId(12), uid: identity.uid, kind: "hilo", status: "active", streak: 0, step: 0, cur, next: round.next, metric: round.metric, seen: [cur.id, round.next.id], createdAt: Date.now() };
  const store = await getStore();
  await store.set(`sessions/${s.id}`, s);
  recent.set(s.id, s);
  return publicRound(s);
}

export async function answerHilo(identity, id, choice) {
  rateLimit(`hiloa:${identity.uid}`, 90);
  if (choice !== "higher" && choice !== "lower") throw new GameError("Pick higher or lower.");
  const store = await getStore();
  let s = recent.get(id);
  if (!s || s.uid !== identity.uid) s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid || s.kind !== "hilo") throw new GameError("That run wasn't found.", 404);
  if (s.status !== "active") throw new GameError("This run is over. Start a new one.");

  const a = valueOf(s.cur, s.metric);
  const b = valueOf(s.next, s.metric);
  const correct = choice === (b > a ? "higher" : "lower");
  const revealed = b;

  if (correct) {
    s.streak += 1;
    s.step += 1;
    const items = await pool().catch(() => null);
    const round = items && (await nextRound(items, s.next, s.streak, new Set(s.seen.slice(-40))));
    if (round) {
      s.cur = s.next;
      s.next = round.next;
      s.metric = round.metric;
      s.seen = [...s.seen, round.next.id].slice(-60);
      await store.set(`sessions/${id}`, s);
      recent.set(id, s);
      if (recent.size > 300) recent.clear();
      return { correct: true, revealed, ...publicRound(s) };
    }
  }

  // The run is over: wrong answer (or we ran out of fresh pairs).
  s.status = "done";
  await store.set(`sessions/${id}`, s);
  recent.delete(id);
  const profile = await getProfile(identity);
  const previous = profile.stats.hiloBest ?? 0;
  const best = Math.max(previous, s.streak);
  const [reward] = await Promise.all([
    award(identity, { profile, xp: Math.min(s.streak * 3, 90) + 2, coins: Math.floor(s.streak / 3), stats: { hiloRuns: 1 }, setStats: { hiloBest: best } }),
    s.streak > 0 ? Promise.all([setBoardScore("hiloWeekly", identity, profile, s.streak), setBoardScore("hiloAll", identity, profile, s.streak)]) : null,
  ]);
  return { correct, done: true, revealed, streak: s.streak, best, record: s.streak > previous, cur: { ...show(s.cur), value: a }, next: { ...show(s.next), value: b }, metric: { key: s.metric, label: METRICS[s.metric].label }, reward };
}

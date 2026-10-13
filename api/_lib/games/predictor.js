import { leagueById, leagueDay, yyyymmdd } from "../sports.js";
import { getStore, inc, remove } from "./store.js";
import { award, getProfile } from "./profile.js";
import { addBoardPoints } from "./leaderboard.js";
import { GameError, newId, plain, rateLimit, weekKey } from "./util.js";

/*
 * Match Predictor: pick the result (and optionally the exact score) before kickoff.
 *   result right = 3 points, exact score = 3 more. Big matches count double or triple.
 * Kickoff times and results always come from the server's own fixtures, never from the browser.
 * Predictions are settled lazily: whenever a player opens the game, their finished matches are scored.
 */

// Competitions you can predict, and which ones are "events" worth extra points.
export const COMPETITIONS = ["eng.1", "uefa.champions", "esp.1", "ita.1", "ger.1", "fra.1", "uefa.europa", "uefa.europa.conf", "nga.1", "caf.nations", "fifa.world", "uefa.euro", "eng.fa", "ned.1", "por.1"];
const EVENTS = {
  "uefa.champions": { label: "Champions League night", mult: 2 },
  "fifa.world": { label: "World Cup", mult: 3 },
  "uefa.euro": { label: "Euros", mult: 3 },
  "caf.nations": { label: "AFCON", mult: 2 },
  "eng.fa": { label: "FA Cup", mult: 1.5 },
};

const DAYS_AHEAD = 5;
const MAX_LEAGUE_MEMBERS = 30;
const POINTS_RESULT = 3;
const POINTS_EXACT = 3;

const resultOf = (home, away) => (home > away ? "H" : home < away ? "A" : "D");

/** Upcoming matches (next few days) in the predictable competitions. */
export async function fixtures() {
  const keys = Array.from({ length: DAYS_AHEAD + 1 }, (_, d) => yyyymmdd(new Date(Date.now() + d * 86_400_000)));
  const grid = await Promise.all(keys.flatMap((key) => COMPETITIONS.map((id) => leagueDay(leagueById(id), key).catch(() => []).then((list) => ({ key, list })))));
  const out = [];
  for (const { key, list } of grid) {
    for (const m of list) {
      if (m.state !== "pre" || new Date(m.kickoff) <= Date.now()) continue;
      out.push({
        id: m.id,
        league: m.league,
        leagueName: m.leagueName,
        date: key,
        kickoff: m.kickoff,
        home: { name: m.home.name, short: m.home.short, logo: m.home.logo },
        away: { name: m.away.name, short: m.away.short, logo: m.away.logo },
        event: EVENTS[m.league] ?? null,
      });
    }
  }
  return out.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

async function findMatch(league, date, id) {
  const info = leagueById(league);
  if (!info || !COMPETITIONS.includes(league) || !/^\d{8}$/.test(date)) return null;
  const list = await leagueDay(info, date).catch(() => []);
  return list.find((m) => m.id === id) ?? null;
}

const predId = (uid, league, id) => `${uid}_${league}_${id}`.replace(/[^\w.-]/g, "_");

export async function place(identity, { league, date, id, pick, homeScore, awayScore }) {
  rateLimit(`pred:${identity.uid}`, 60);
  if (!["H", "D", "A"].includes(pick)) throw new GameError("Pick home win, draw or away win.");
  const m = await findMatch(league, String(date), String(id));
  if (!m) throw new GameError("That match isn't open for predictions.", 404);
  if (m.state !== "pre" || new Date(m.kickoff) <= Date.now()) throw new GameError("Too late: predictions close at kickoff.");

  let hs = null;
  let as = null;
  if (homeScore !== undefined && homeScore !== null && homeScore !== "") {
    hs = Number(homeScore);
    as = Number(awayScore);
    if (!Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0 || hs > 20 || as > 20) throw new GameError("Scores must be whole numbers from 0 to 20.");
    if (resultOf(hs, as) !== pick) throw new GameError("Your score doesn't match your pick. Fix one of them.");
  }
  const store = await getStore();
  const path = `predictions/${predId(identity.uid, league, id)}`;
  const existing = await store.get(path);
  if (existing && existing.status !== "open") throw new GameError("That prediction is already settled.");
  await store.set(path, {
    uid: identity.uid,
    league,
    matchId: String(id),
    date: String(date),
    kickoff: m.kickoff,
    home: m.home.name,
    away: m.away.name,
    homeLogo: m.home.logo ?? null,
    awayLogo: m.away.logo ?? null,
    leagueName: m.leagueName,
    pick,
    hs,
    as,
    mult: EVENTS[league]?.mult ?? 1,
    status: "open",
    points: 0,
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  if (!existing) await award(identity, { xp: 2, game: true, stats: { predictions: 1 } });
  return { ok: true };
}

/* ---------- settling ---------- */

/** Scores this player's open predictions whose matches have finished. */
export async function settle(identity) {
  const store = await getStore();
  const open = await store.list("predictions", { where: [["uid", "==", identity.uid], ["status", "==", "open"]], limit: 100 });
  const due = open.filter((p) => new Date(p.kickoff).getTime() + 100 * 60_000 < Date.now()).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  if (!due.length) return [];

  const profile = await getProfile(identity);
  const settled = [];
  let run = profile.stats.predRun ?? 0;
  let runBest = profile.stats.predRunBest ?? 0;
  const delta = { xp: 0, coins: 0, pts: 0, correct: 0, exact: 0 };

  for (const p of due) {
    const m = await findMatch(p.league, p.date, p.matchId);
    const hoursSince = (Date.now() - new Date(p.kickoff).getTime()) / 3_600_000;
    if (!m || m.state !== "post") {
      // Postponed or cancelled: void it after 3 days so it doesn't sit there forever.
      if (hoursSince > 72) await store.update(`predictions/${p.id}`, { status: "void", settledAt: Date.now() });
      continue;
    }
    const h = Number(m.home.score);
    const a = Number(m.away.score);
    if (!Number.isFinite(h) || !Number.isFinite(a)) continue;
    const resultRight = resultOf(h, a) === p.pick;
    const exact = resultRight && p.hs === h && p.as === a;
    const base = (resultRight ? POINTS_RESULT : 0) + (exact ? POINTS_EXACT : 0);
    const points = Math.round(base * (p.mult ?? 1));
    await store.update(`predictions/${p.id}`, { status: "settled", points, resultRight, exact, finalHome: h, finalAway: a, settledAt: Date.now() });
    settled.push({ id: p.id, home: p.home, away: p.away, finalHome: h, finalAway: a, pick: p.pick, points, resultRight, exact, mult: p.mult ?? 1 });

    run = resultRight ? run + 1 : 0;
    runBest = Math.max(runBest, run);
    delta.pts += points;
    delta.xp += points * 4;
    delta.coins += points;
    if (resultRight) delta.correct += 1;
    if (exact) delta.exact += 1;
  }
  if (!settled.length) return [];

  await award(identity, {
    xp: delta.xp,
    coins: delta.coins,
    game: false,
    stats: { predCorrect: delta.correct, predExact: delta.exact },
    setStats: { predRun: run, predRunBest: runBest },
  });
  const fresh = await getProfile(identity);
  await Promise.all([addBoardPoints("predWeekly", identity, fresh, delta.pts), addBoardPoints("predAll", identity, fresh, delta.pts)]);
  // Points for every friends league this player is in.
  const week = weekKey();
  for (const code of fresh.leagues) {
    const league = await store.get(`pleagues/${code}`).catch(() => null);
    if (!league?.members?.[identity.uid]) continue;
    const wk = league.members[identity.uid].wkKey === week;
    await store.update(`pleagues/${code}`, {
      [`members.${identity.uid}.pts`]: inc(delta.pts),
      [`members.${identity.uid}.wkKey`]: week,
      [`members.${identity.uid}.wk`]: (wk ? league.members[identity.uid].wk ?? 0 : 0) + delta.pts,
    });
  }
  return settled;
}

export async function myPredictions(identity) {
  const store = await getStore();
  const rows = await store.list("predictions", { where: [["uid", "==", identity.uid]], limit: 200 });
  const view = (p) => ({ id: p.id, league: p.league, leagueName: p.leagueName, matchId: p.matchId, date: p.date, kickoff: p.kickoff, home: p.home, away: p.away, homeLogo: p.homeLogo, awayLogo: p.awayLogo, pick: p.pick, hs: p.hs, as: p.as, mult: p.mult ?? 1, status: p.status, points: p.points, exact: p.exact ?? false, resultRight: p.resultRight ?? false, finalHome: p.finalHome ?? null, finalAway: p.finalAway ?? null });
  const sorted = rows.sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
  return { open: sorted.filter((p) => p.status === "open").map(view).reverse(), settled: sorted.filter((p) => p.status === "settled").slice(0, 30).map(view) };
}

/* ---------- friends leagues ---------- */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const leagueCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export async function createLeague(identity, name) {
  rateLimit(`league:${identity.uid}`, 5, 3600_000);
  const clean = String(name ?? "").replace(/[^\p{L}\p{N} ._'!-]/gu, "").trim().slice(0, 28);
  if (clean.length < 3) throw new GameError("Give your league a name (at least 3 letters).");
  const store = await getStore();
  const profile = await getProfile(identity);
  if (profile.leagues.length >= 8) throw new GameError("You're in 8 leagues already. Leave one first.");
  let code = leagueCode();
  for (let i = 0; i < 6 && (await store.get(`pleagues/${code}`)); i++) code = leagueCode();
  await store.set(`pleagues/${code}`, {
    code,
    name: clean,
    owner: identity.uid,
    createdAt: Date.now(),
    members: { [identity.uid]: { name: profile.name, avatar: profile.avatar, pts: 0, wk: 0, wkKey: weekKey(), joinedAt: Date.now() } },
  });
  profile.leagues.push(code);
  await store.set(`gp/${identity.uid}`, profile);
  return { code };
}

export async function joinLeague(identity, rawCode) {
  rateLimit(`join-league:${identity.uid}`, 20);
  const code = String(rawCode ?? "").toUpperCase().trim();
  const store = await getStore();
  const league = await store.get(`pleagues/${code}`);
  if (!league) throw new GameError("No league with that code.", 404);
  const profile = await getProfile(identity);
  if (league.members[identity.uid]) return { code, already: true };
  if (Object.keys(league.members).length >= MAX_LEAGUE_MEMBERS) throw new GameError("That league is full (30 players).");
  if (profile.leagues.length >= 8) throw new GameError("You're in 8 leagues already. Leave one first.");
  await store.update(`pleagues/${code}`, { [`members.${identity.uid}`]: { name: profile.name, avatar: profile.avatar, pts: 0, wk: 0, wkKey: weekKey(), joinedAt: Date.now() } });
  profile.leagues.push(code);
  await store.set(`gp/${identity.uid}`, profile);
  await award(identity, { xp: 0, game: false, stats: { leaguesJoined: 1 } });
  return { code };
}

export async function leaveLeague(identity, rawCode) {
  const code = String(rawCode ?? "").toUpperCase().trim();
  const store = await getStore();
  const league = await store.get(`pleagues/${code}`);
  const profile = await getProfile(identity);
  profile.leagues = profile.leagues.filter((c) => c !== code);
  await store.set(`gp/${identity.uid}`, profile);
  if (league?.members?.[identity.uid]) {
    await store.update(`pleagues/${code}`, { [`members.${identity.uid}`]: remove() });
  }
  return { ok: true };
}

export async function myLeagues(identity) {
  const store = await getStore();
  const profile = await getProfile(identity);
  const week = weekKey();
  const leagues = await Promise.all(
    profile.leagues.map(async (code) => {
      const l = await store.get(`pleagues/${code}`);
      if (!l) return null;
      const members = Object.entries(l.members).map(([uid, m]) => ({ uid, name: m.name, avatar: m.avatar ?? "⚽", pts: m.pts ?? 0, wk: m.wkKey === week ? m.wk ?? 0 : 0, me: uid === identity.uid }));
      return { code, name: l.name, owner: l.owner === identity.uid, members: members.sort((a, b) => b.pts - a.pts || b.wk - a.wk) };
    }),
  );
  return leagues.filter(Boolean);
}

export { newId, plain };

import { cached, getJson, isFootball, leagueById, pathOf } from "./sports.js";
import { getStore } from "./games/store.js";

/*
 * Goals and assists counted from the matches themselves.
 *
 * ESPN's season tables (top scorers, a player's season stats) can run a day or more behind the real
 * games. A finished match never changes, so we read each one once (who scored, who assisted), keep
 * the result in the games database, and add up the season from that. Live matches are read fresh on
 * every refresh, so a goal appears in the tables while the game is still being played.
 */

const BATCH = 12; // matches read at once
const BUDGET_MS = 9_000; // per request; a big league finishes its first count over a few requests

const goalKind = (type = "") => !/own goal/i.test(type) && !/penalty.*(missed|saved)/i.test(type) && /goal|penalty.*scored/i.test(type);

/** Every match of the current season (finished, live, upcoming), one scoreboard call per calendar year. */
async function seasonMatches(league) {
  const base = `https://site.api.espn.com/apis/site/v2/sports/${pathOf(league)}/scoreboard`;
  return cached(`season:${league}`, 2 * 60_000, async () => {
    const head = await getJson(base);
    const season = head.leagues?.[0]?.season ?? {};
    const start = season.startDate ?? `${new Date().getUTCFullYear()}-01-01`;
    const years = [...new Set([Number(start.slice(0, 4)), new Date().getUTCFullYear()])];
    const lists = await Promise.all(years.map((y) => getJson(`${base}?dates=${y}&limit=1000`).then((j) => j.events ?? [])));
    const seen = new Set();
    const matches = lists
      .flat()
      .filter((e) => e.date >= start && !seen.has(e.id) && seen.add(e.id))
      .map((e) => ({ id: e.id, state: e.status?.type?.state ?? "pre" }));
    const live = matches.some((m) => m.state === "in");
    return { value: { start, matches }, ttl: live ? 20_000 : 2 * 60_000 };
  });
}

/** Who scored (and who set it up) in one match. */
async function readMatch(league, id) {
  const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${pathOf(league)}/summary?event=${id}`);
  const teams = new Map((j.header?.competitions?.[0]?.competitors ?? []).map((c) => [c.team?.id, { team: c.team?.displayName ?? "", teamLogo: c.team?.logos?.[0]?.href ?? c.team?.logo ?? null }]));
  const goals = [];
  for (const k of j.keyEvents ?? []) {
    if (!goalKind(k.type?.text) || (k.period?.number ?? 1) >= 5) continue; // shoot-out kicks are not goals
    const [scorer, assister] = k.participants ?? [];
    if (!scorer?.athlete) continue;
    const t = teams.get(k.team?.id) ?? { team: k.team?.displayName ?? "", teamLogo: null };
    goals.push({
      id: scorer.athlete.id ?? null,
      name: scorer.athlete.displayName ?? "",
      teamId: k.team?.id ?? null,
      ...t,
      aId: assister?.athlete?.id ?? null,
      aName: assister?.athlete?.displayName ?? null,
    });
  }
  return goals;
}

async function loadStore() {
  try {
    return await getStore();
  } catch {
    return null;
  }
}

/** Every goal of the season so far, and whether every finished match has been counted yet. */
async function seasonGoals(league) {
  return cached(`tally:${league}`, 20_000, async () => {
    const { start, matches } = await seasonMatches(league);
    const store = await loadStore();
    const path = `tally/${league}`;
    let doc = null;
    try {
      doc = await store?.get(path);
    } catch {
      /* count again from scratch if the database can't be read */
    }
    if (doc && doc.season !== start) doc = null; // a new season starts a new count
    const done = { ...(doc?.matches ?? {}) };

    const finished = matches.filter((m) => m.state === "post");
    const todo = finished.filter((m) => !(m.id in done));
    const deadline = Date.now() + BUDGET_MS;
    const added = {};
    for (let i = 0; i < todo.length && Date.now() < deadline; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      const got = await Promise.allSettled(batch.map((m) => readMatch(league, m.id)));
      got.forEach((r, n) => {
        if (r.status === "fulfilled") added[batch[n].id] = r.value;
      });
    }
    Object.assign(done, added);
    if (store && Object.keys(added).length) {
      try {
        if (doc) await store.update(path, Object.fromEntries(Object.entries(added).map(([id, g]) => [`matches.${id}`, g])));
        else await store.set(path, { season: start, matches: added });
      } catch {
        /* the count is still right for this request */
      }
    }

    // Matches being played right now are read fresh each time.
    const live = matches.filter((m) => m.state === "in");
    const liveGoals = (await Promise.allSettled(live.map((m) => readMatch(league, m.id)))).flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    const complete = finished.every((m) => m.id in done);
    const goals = [...finished.filter((m) => m.id in done).flatMap((m) => done[m.id]), ...liveGoals];
    return { value: { complete, goals, matches: finished.length, counted: finished.filter((m) => m.id in done).length, live: live.length > 0, updatedAt: Date.now() }, ttl: live.length ? 20_000 : 60_000 };
  });
}

/** Goals and assists per player for the season, or null when the count isn't complete yet. */
export async function getTally(league) {
  if (!leagueById(league) || !isFootball(league)) return null;
  let season;
  try {
    season = await seasonGoals(league);
  } catch {
    return null;
  }
  if (!season.complete) return null;
  const players = new Map(); // id → { id, name, team, teamId, teamLogo, goals, assists }
  const row = (id, name, g) => {
    const key = id ?? `${name}|${g.team}`;
    let r = players.get(key);
    if (!r) players.set(key, (r = { id, name, team: g.team, teamId: g.teamId, teamLogo: g.teamLogo, goals: 0, assists: 0 }));
    return r;
  };
  for (const g of season.goals) {
    row(g.id, g.name, g).goals += 1;
    if (g.aName) row(g.aId, g.aName, g).assists += 1;
  }
  return { players, live: season.live, updatedAt: season.updatedAt };
}

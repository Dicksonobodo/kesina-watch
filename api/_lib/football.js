import { cached, getJson, isFootball, leagueById, pathOf } from "./sports.js";
import { getStandings } from "./standings.js";

/*
 * League, player and team pages for every sport we serve: league leaders (football), a player's
 * profile with season stats, and a team's fixtures, results and squad (ESPN public feeds, cached).
 */

const check = (league, id) => {
  if (!pathOf(league) || (id !== undefined && !/^\d+$/.test(id))) throw new Error("bad request");
};

const statValue = (dv, key) => Number(String(dv).match(new RegExp(`${key}:\\s*(\\d+)`))?.[1]) || null;

/** Top scorers, assists and goal contributions for a league, plus best attack / defence from the table. */
export async function getLeaders(league) {
  check(league);
  if (!isFootball(league)) throw new Error("bad request");
  return cached(`leaders:${league}`, 30 * 60_000, async () => {
    const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${pathOf(league)}/statistics`);
    const list = (name, key) =>
      (j.stats?.find((s) => s.name === name)?.leaders ?? []).slice(0, 50).map((l, i) => ({
        rank: i + 1,
        id: l.athlete?.id ?? null,
        name: l.athlete?.displayName ?? "",
        team: l.athlete?.team?.displayName ?? "",
        teamId: l.athlete?.team?.id ?? null,
        teamLogo: l.athlete?.team?.logos?.[0]?.href ?? null,
        value: l.value ?? statValue(l.displayValue, key),
        matches: statValue(l.displayValue, "Matches"),
      }));
    const scorers = list("goalsLeaders", "Goals");
    const assists = list("assistsLeaders", "Assists");

    // Goals + assists per player, from the two lists (a player must appear in at least one).
    const byPlayer = new Map();
    for (const [rows, field] of [[scorers, "goals"], [assists, "assists"]]) {
      for (const r of rows) {
        const row = byPlayer.get(r.id) ?? { ...r, goals: 0, assists: 0 };
        row[field] = r.value ?? 0;
        row.matches = row.matches ?? r.matches;
        byPlayer.set(r.id, row);
      }
    }
    const contributions = [...byPlayer.values()]
      .map((r) => ({ ...r, value: r.goals + r.assists }))
      .sort((a, b) => b.value - a.value || b.goals - a.goals)
      .slice(0, 50)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    // Best attack / meanest defence come from the league table.
    let attack = [];
    let defence = [];
    try {
      const table = await getStandings(league);
      const col = (key) => table.columns.findIndex((c) => c.key === key);
      const rows = table.groups.flatMap((g) => g.rows);
      const gf = col("pointsFor");
      const ga = col("pointsAgainst");
      const played = col("gamesPlayed");
      const team = (r, value) => ({ id: r.teamId, name: r.team, logo: r.logo, value, played: Number(r.values[played]) || null });
      if (gf >= 0) attack = [...rows].sort((a, b) => Number(b.values[gf]) - Number(a.values[gf])).slice(0, 10).map((r) => team(r, Number(r.values[gf])));
      if (ga >= 0) defence = [...rows].sort((a, b) => Number(a.values[ga]) - Number(b.values[ga])).slice(0, 10).map((r) => team(r, Number(r.values[ga])));
    } catch {
      /* the table is optional */
    }

    return {
      value: { league, leagueName: leagueById(league)?.name ?? league, scorers, assists, contributions, attack, defence },
    };
  });
}

/** One player's profile and season stats. */
export async function getPlayer(league, id) {
  check(league, id);
  return cached(`player:${league}:${id}`, 6 * 3600_000, async () => {
    const j = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/${pathOf(league)}/athletes/${id}`);
    const a = j.athlete ?? {};
    return {
      value: {
        id,
        league,
        name: a.displayName ?? "",
        firstName: a.firstName ?? "",
        lastName: a.lastName ?? "",
        jersey: a.jersey ?? null,
        position: a.position?.displayName ?? null,
        team: a.team?.displayName ?? null,
        teamId: a.team?.id ?? null,
        teamLogo: a.team?.logos?.[0]?.href ?? null,
        age: a.age ?? null,
        born: a.displayDOB ?? null,
        nationality: a.citizenship ?? null,
        flag: a.flag?.href ?? null,
        height: a.displayHeight ?? null,
        weight: a.displayWeight ?? null,
        photo: a.headshot?.href ?? null,
        season: (a.statsSummary?.statistics ?? []).map((s) => ({ label: s.displayName, value: s.displayValue })),
      },
    };
  });
}

function mapGame(e, teamId) {
  const c = e.competitions?.[0] ?? {};
  const me = c.competitors?.find((x) => x.id === teamId || x.team?.id === teamId);
  const them = c.competitors?.find((x) => x !== me);
  const score = (x) => x?.score?.displayValue ?? x?.score ?? null;
  const state = c.status?.type?.state ?? e.status?.type?.state ?? "pre";
  let result = null;
  if (state === "post" && me && them) {
    const a = Number(score(me));
    const b = Number(score(them));
    result = a > b ? "W" : a < b ? "L" : "D";
  }
  return {
    id: e.id,
    date: e.date,
    state,
    competition: e.league?.abbreviation ?? e.season?.displayName ?? "",
    venue: me?.homeAway ?? null,
    opponent: them?.team?.displayName ?? "",
    opponentLogo: them?.team?.logos?.[0]?.href ?? them?.team?.logo ?? null,
    score: state === "pre" ? null : `${score(me) ?? 0}–${score(them) ?? 0}`,
    result,
  };
}

const GROUPS = [
  ["Goalkeepers", /^G/],
  ["Defenders", /^(D|CB|CD|RB|LB|WB|SW)/],
  ["Midfielders", /^(M|DM|CM|AM|RM|LM)/],
  ["Forwards", /^(F|ST|CF|W|RW|LW|S)/],
];

/** A team's recent results, upcoming fixtures and squad. */
export async function getTeam(league, id) {
  check(league, id);
  return cached(`team:${league}:${id}`, 30 * 60_000, async () => {
    const base = `https://site.api.espn.com/apis/site/v2/sports/${pathOf(league)}/teams/${id}`;
    const [results, fixtures, roster] = await Promise.all([
      getJson(`${base}/schedule`).catch(() => ({})),
      getJson(`${base}/schedule?fixture=true`).catch(() => ({})),
      getJson(`${base}/roster`).catch(() => ({})),
    ]);
    const team = roster.team ?? results.team ?? {};
    const players = (roster.athletes ?? []).flatMap((p) => p.items ?? [p]).map((p) => {
      const cats = p.statistics?.splits?.categories ?? [];
      const stat = (abbr) => cats.flatMap((c) => c.stats ?? []).find((s) => s.abbreviation === abbr)?.displayValue ?? null;
      return {
        id: p.id,
        name: p.displayName ?? "",
        jersey: p.jersey ?? "",
        position: p.position?.abbreviation ?? "",
        age: p.age ?? null,
        nationality: p.citizenship ?? null,
        photo: p.headshot?.href ?? null,
        apps: stat("APP"),
        goals: stat("G"),
        assists: stat("A"),
      };
    });
    // Football squads group by line; other sports list one roster.
    const squad = isFootball(league) ? GROUPS.map(([label, re]) => ({ label, players: players.filter((p) => re.test(p.position)) })).filter((g) => g.players.length) : [];
    const grouped = new Set(squad.flatMap((g) => g.players));
    const others = players.filter((p) => !grouped.has(p));
    if (others.length) squad.push({ label: isFootball(league) ? "Squad" : "Roster", players: others });

    return {
      value: {
        id,
        league,
        name: team.displayName ?? "",
        logo: team.logo ?? team.logos?.[0]?.href ?? null,
        record: team.recordSummary ?? null,
        standing: team.standingSummary ?? null,
        results: (results.events ?? []).map((e) => mapGame(e, id)).filter((g) => g.state === "post").slice(-8).reverse(),
        fixtures: (fixtures.events ?? []).map((e) => mapGame(e, id)).filter((g) => g.state !== "post").slice(0, 8),
        squad,
      },
    };
  });
}

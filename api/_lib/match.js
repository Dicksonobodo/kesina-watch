import { cached, getJson } from "./sports.js";

/*
 * Match centre for one game (ESPN summary feed): score, timeline of goals / cards / subs,
 * line-ups with formations placed on a pitch, team stats, and the league table.
 */

// Position abbreviation → pitch row (0 keeper … 3.4 strikers) and lane (-2 left wing … 2 right wing).
// Wide roles (LB, RM, LW…) sit on the outside; "-L" / "-R" roles (CD-L, CM-R…) sit inside them.
function pitchSpot(abbr = "") {
  const a = abbr.toUpperCase();
  let row = 2;
  if (a === "G" || a === "GK") row = 0;
  else if (/^DM/.test(a)) row = 1.5;
  else if (/^(CB|CD|RB|LB|RWB|LWB|SW|D)/.test(a)) row = 1;
  else if (/^AM/.test(a)) row = 2.6;
  else if (/^(CM|RM|LM|M)/.test(a)) row = 2;
  else if (/^(F|CF|ST|RF|LF|S|W|RW|LW)/.test(a)) row = 3.4;
  let lane = 0;
  if (/^(L|LW|LB|LM|LWB)/.test(a) && !/-/.test(a)) lane = -2;
  else if (/^(R|RW|RB|RM|RWB)/.test(a) && !/-/.test(a)) lane = 2;
  else if (/-L$/.test(a)) lane = -1;
  else if (/-R$/.test(a)) lane = 1;
  return { row, lane };
}

function mapLineup(r) {
  if (!r) return null;
  const player = (p) => ({
    name: p.athlete?.displayName ?? "",
    short: p.athlete?.shortName ?? p.athlete?.displayName ?? "",
    number: p.jersey ?? "",
    position: p.position?.abbreviation ?? "",
    subbedIn: Boolean(p.subbedIn),
    subbedOut: Boolean(p.subbedOut),
    ...pitchSpot(p.position?.abbreviation),
  });
  return {
    team: r.team?.displayName ?? "",
    formation: r.formation ?? null,
    starters: (r.roster ?? []).filter((p) => p.starter).map(player),
    bench: (r.roster ?? []).filter((p) => !p.starter).map(player),
  };
}

const STAT_ROWS = [
  ["possessionPct", "Possession", "%"],
  ["totalShots", "Shots"],
  ["shotsOnTarget", "On target"],
  ["wonCorners", "Corners"],
  ["passPct", "Pass accuracy", "%"],
  ["foulsCommitted", "Fouls"],
  ["offsides", "Offsides"],
  ["yellowCards", "Yellow cards"],
  ["redCards", "Red cards"],
  ["saves", "Saves"],
];

function eventKind(type = "") {
  if (/own goal/i.test(type)) return "own-goal";
  if (/penalty.*(missed|saved)/i.test(type)) return "pen-miss";
  if (/goal/i.test(type)) return "goal";
  if (/red card/i.test(type)) return "red";
  if (/yellow card/i.test(type)) return "yellow";
  if (/substitution/i.test(type)) return "sub";
  if (/half ?time|end regular|full ?time/i.test(type)) return "break";
  return null;
}

/** Everything for one match: score, timeline, line-ups / formations, stats, table. */
export async function getMatch({ league, id }) {
  if (!/^[\w.]+$/.test(league) || !/^\d+$/.test(id)) throw new Error("bad match id");
  return cached(`match:${league}:${id}`, 60_000, async () => {
    const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${id}`);
    const comp = j.header?.competitions?.[0] ?? {};
    const side = (ha) => comp.competitors?.find((c) => c.homeAway === ha) ?? {};
    const home = side("home");
    const away = side("away");
    const team = (c) => ({
      id: c.team?.id,
      name: c.team?.displayName ?? "",
      short: c.team?.shortDisplayName ?? c.team?.displayName ?? "",
      abbr: c.team?.abbreviation ?? "",
      logo: c.team?.logos?.[0]?.href ?? c.team?.logo ?? null,
      score: c.score ?? null,
      winner: Boolean(c.winner),
      form: c.form ?? null,
    });
    const state = comp.status?.type?.state ?? "pre";

    const events = (j.keyEvents ?? [])
      .map((k) => ({ kind: eventKind(k.type?.text), k }))
      .filter((e) => e.kind)
      .map(({ kind, k }) => ({
        kind,
        clock: k.clock?.displayValue ?? "",
        side: k.team?.id ? (k.team.id === home.team?.id ? "home" : "away") : null,
        // Goals: scorer then assist. Subs: player coming on then player going off.
        players: (k.participants ?? []).map((p) => p.athlete?.displayName).filter(Boolean),
        label: k.type?.text ?? "",
        text: k.text ?? "",
      }));

    const statsFor = (teamId) => j.boxscore?.teams?.find((t) => t.team?.id === teamId)?.statistics ?? [];
    const hs = statsFor(home.team?.id);
    const as = statsFor(away.team?.id);
    const stats = STAT_ROWS.map(([key, label, unit]) => {
      const h = hs.find((s) => s.name === key)?.displayValue;
      const a = as.find((s) => s.name === key)?.displayValue;
      if (h == null && a == null) return null;
      // ESPN gives some percentages as fractions (0.9 = 90%).
      const pct = (v) => (unit === "%" && Number(v) <= 1 ? String(Math.round(Number(v) * 100)) : String(Math.round(Number(v) * 10) / 10));
      return { key, label, unit: unit ?? "", home: pct(h ?? 0), away: pct(a ?? 0) };
    }).filter(Boolean);

    const lineups = {
      home: mapLineup(j.rosters?.find((r) => r.homeAway === "home")),
      away: mapLineup(j.rosters?.find((r) => r.homeAway === "away")),
    };

    const rows = j.standings?.groups?.[0]?.standings?.entries ?? [];
    const statOf = (row, name) => row.stats?.find((s) => s.name === name)?.displayValue ?? "";
    const table = rows.map((row) => ({
      rank: Number(statOf(row, "rank")) || null,
      team: row.team ?? "",
      played: statOf(row, "gamesPlayed"),
      gd: statOf(row, "pointDifferential"),
      points: statOf(row, "points"),
      highlight: [home.team?.displayName, away.team?.displayName].includes(row.team),
    }));

    const value = {
      id,
      league,
      state,
      clock: comp.status?.displayClock ?? null,
      detail: comp.status?.type?.shortDetail ?? comp.status?.type?.detail ?? "",
      kickoff: comp.date ?? null,
      home: team(home),
      away: team(away),
      venue: j.gameInfo?.venue?.fullName ?? null,
      city: j.gameInfo?.venue?.address?.city ?? null,
      attendance: j.gameInfo?.attendance ?? null,
      events,
      lineups: lineups.home?.starters.length ? lineups : null,
      stats,
      table: table.length ? table : null,
      broadcasters: [...new Set((j.broadcasts ?? []).map((b) => b.media?.shortName).filter(Boolean))].slice(0, 4),
    };
    // Live: refresh every 20s. Finished: final. Upcoming: every 10 minutes (line-ups appear about an hour before).
    return { value, ttl: state === "in" ? 20_000 : state === "post" ? 6 * 3600_000 : 10 * 60_000 };
  });
}

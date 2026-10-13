import { cached, getJson, leagueById } from "./sports.js";

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

// A player's numbers in this match (only the ones worth showing, non-zero first).
const PLAYER_STAT_LABELS = { G: "Goals", A: "Assists", SHOT: "Shots", SOG: "On target", SV: "Saves", GA: "Conceded", FC: "Fouls", FA: "Fouled", YC: "Yellow", RC: "Red", OF: "Offsides" };
function playerStats(list = []) {
  return list
    .filter((s) => PLAYER_STAT_LABELS[s.abbreviation])
    .map((s) => ({ key: s.abbreviation, label: PLAYER_STAT_LABELS[s.abbreviation], value: s.displayValue ?? String(s.value ?? 0) }));
}

function mapLineup(r) {
  if (!r) return null;
  const player = (p) => ({
    id: p.athlete?.id ?? null,
    stats: playerStats(p.stats),
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

// Other sports: every team statistic that is a plain number, with ESPN's own labels.
function genericStats(hs, as) {
  const out = [];
  for (const h of hs) {
    const a = as.find((s) => s.name === h.name);
    const hv = parseFloat(String(h.displayValue).replace(/[%,]/g, ""));
    const av = parseFloat(String(a?.displayValue ?? "").replace(/[%,]/g, ""));
    if (!a || Number.isNaN(hv) || Number.isNaN(av) || !/^-?[\d.,]+%?$/.test(String(h.displayValue)) || out.length >= 14) continue;
    out.push({ key: h.name, label: h.label || h.name, unit: String(h.displayValue).endsWith("%") ? "%" : "", home: String(hv), away: String(av) });
  }
  return out;
}

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
  const info = leagueById(league);
  if (!info || !/^\d+$/.test(id)) throw new Error("bad match id");
  const football = info.sport === "football";
  return cached(`match:${league}:${id}`, 60_000, async () => {
    const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${info.path}/summary?event=${id}`);
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
    const stats = !football ? genericStats(hs, as) : STAT_ROWS.map(([key, label, unit]) => {
      const h = hs.find((s) => s.name === key)?.displayValue;
      const a = as.find((s) => s.name === key)?.displayValue;
      if (h == null && a == null) return null;
      // ESPN gives some percentages as fractions (0.9 = 90%).
      const pct = (v) => (unit === "%" && Number(v) <= 1 ? String(Math.round(Number(v) * 100)) : String(Math.round(Number(v) * 10) / 10));
      return { key, label, unit: unit ?? "", home: pct(h ?? 0), away: pct(a ?? 0) };
    }).filter(Boolean);

    const lineups = !football ? { home: null, away: null } : {
      home: mapLineup(j.rosters?.find((r) => r.homeAway === "home")),
      away: mapLineup(j.rosters?.find((r) => r.homeAway === "away")),
    };

    const rows = football ? (j.standings?.groups?.[0]?.standings?.entries ?? []) : [];
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
      sport: info.sport,
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

      // Minute-by-minute text, newest first.
      commentary: football
        ? (j.commentary ?? [])
            .filter((c) => c.text)
            .map((c) => ({ clock: c.time?.displayValue ?? "", text: c.text, type: c.play?.type?.text ?? "" }))
            .reverse()
        : (j.plays ?? [])
            .filter((p) => p.text && p.scoringPlay)
            .slice(-60)
            .map((p) => ({ clock: [p.period?.displayValue, p.clock?.displayValue].filter(Boolean).join(" "), text: p.text, type: p.type?.text ?? "" }))
            .reverse(),

      // Official highlight clips (ESPN). Plain MP4 plays straight in a <video>.
      highlights: (j.videos ?? [])
        .filter((v) => v.links?.source?.href)
        .slice(0, 6)
        .map((v) => ({
          id: String(v.id),
          title: v.headline ?? "Highlights",
          duration: v.duration ?? null,
          thumbnail: v.thumbnail ?? null,
          mp4: v.links.source.href,
          hls: v.links.source.HLS?.href ?? null,
        })),

      // Best player per stat, for each team.
      performers: (j.leaders ?? []).map((t) => ({
        side: t.team?.id === home.team?.id ? "home" : "away",
        categories: (t.leaders ?? [])
          .map((cat) => {
            const top = cat.leaders?.[0];
            if (!top?.athlete) return null;
            return {
              label: cat.displayName ?? cat.name,
              player: top.athlete.displayName,
              playerId: top.athlete.id ?? null,
              jersey: top.athlete.jersey ?? "",
              value: top.mainStat?.value ?? top.displayValue ?? "",
            };
          })
          .filter(Boolean),
      })),

      // Last five results for each team (W/D/L).
      form: (j.lastFiveGames ?? []).map((t) => ({
        side: t.team?.id === home.team?.id ? "home" : "away",
        games: (t.events ?? []).slice(0, 5).map((e) => ({
          result: e.gameResult ?? "",
          score: e.score ?? "",
          opponent: e.opponent?.displayName ?? "",
          opponentLogo: e.opponentLogo ?? null,
          venue: e.atVs === "@" ? "away" : "home",
          date: e.gameDate ?? null,
        })),
      })),

      // Previous meetings between these two teams.
      headToHead: (() => {
        const series = (j.seasonseries ?? [])[0];
        if (!series) return null;
        return {
          summary: series.summary ?? "",
          games: (series.events ?? []).slice(0, 8).map((e) => ({
            date: e.date ?? null,
            teams: (e.competitors ?? []).map((c) => ({ abbr: c.team?.abbreviation ?? "", logo: c.team?.logo ?? c.team?.logos?.[0]?.href ?? null, score: c.score ?? "", home: c.homeAway === "home" })),
          })),
        };
      })(),

      news: (j.news?.articles ?? []).slice(0, 6).map((a) => ({
        title: a.headline ?? "",
        link: a.links?.web?.href ?? null,
        image: a.images?.[0]?.url ?? null,
      })).filter((n) => n.title && n.link),
    };
    // Live: refresh every 20s. Finished: final. Upcoming: every 10 minutes (line-ups appear about an hour before).
    return { value, ttl: state === "in" ? 20_000 : state === "post" ? 6 * 3600_000 : 10 * 60_000 };
  });
}

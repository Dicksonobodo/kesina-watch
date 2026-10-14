import { cached, getJson, leagueById } from "./sports.js";

/*
 * League tables for every competition (ESPN standings feed). Each sport shows the columns
 * that make sense for it; groups are conferences / divisions / cup groups.
 */

// [stat name, header]; columns missing from the feed are dropped.
const COLUMNS = {
  football: [["gamesPlayed", "P"], ["wins", "W"], ["ties", "D"], ["losses", "L"], ["pointsFor", "GF"], ["pointsAgainst", "GA"], ["pointDifferential", "GD"], ["points", "Pts"]],
  basketball: [["wins", "W"], ["losses", "L"], ["winPercent", "PCT"], ["gamesBehind", "GB"], ["avgPointsFor", "PPG"], ["differential", "DIFF"], ["streak", "STRK"]],
  "american-football": [["wins", "W"], ["losses", "L"], ["ties", "T"], ["winPercent", "PCT"], ["pointsFor", "PF"], ["pointsAgainst", "PA"], ["pointDifferential", "DIFF"], ["streak", "STRK"]],
  baseball: [["wins", "W"], ["losses", "L"], ["winPercent", "PCT"], ["gamesBehind", "GB"], ["pointsFor", "RS"], ["pointsAgainst", "RA"], ["pointDifferential", "DIFF"], ["streak", "STRK"]],
  hockey: [["gamesPlayed", "GP"], ["wins", "W"], ["losses", "L"], ["otLosses", "OTL"], ["points", "Pts"], ["pointsFor", "GF"], ["pointsAgainst", "GA"], ["pointDifferential", "DIFF"]],
};

export async function getStandings(league) {
  const info = leagueById(league);
  if (!info) throw new Error("bad request");
  return cached(`standings:${league}`, 5 * 60_000, async () => {
    const j = await getJson(`https://site.api.espn.com/apis/v2/sports/${info.path}/standings`);
    const children = j.children?.length ? j.children : [j];
    const spec = COLUMNS[info.sport];
    const first = children.flatMap((c) => c.standings?.entries ?? [])[0];
    const have = new Set((first?.stats ?? []).map((s) => s.name));
    const cols = spec.filter(([key]) => have.has(key));

    const groups = children
      .map((c) => {
        const entries = c.standings?.entries ?? [];
        const rows = entries
          .map((e, i) => {
            const stat = (name) => e.stats?.find((s) => s.name === name)?.displayValue ?? "";
            return {
              rank: Number(stat("rank")) || Number(stat("playoffSeed")) || i + 1,
              teamId: e.team?.id ?? null,
              team: e.team?.displayName ?? "",
              short: e.team?.shortDisplayName ?? e.team?.displayName ?? "",
              abbr: e.team?.abbreviation ?? "",
              logo: e.team?.logos?.[0]?.href ?? null,
              values: cols.map(([key]) => stat(key)),
              note: e.note?.description ?? null,
              noteColor: e.note?.color ?? null,
            };
          })
          .sort((a, b) => a.rank - b.rank);
        return { name: c.name ?? "", rows };
      })
      .filter((g) => g.rows.length);

    return {
      value: {
        league,
        leagueName: info.name,
        sport: info.sport,
        season: children[0]?.standings?.seasonDisplayName ?? j.seasons?.[0]?.displayName ?? null,
        columns: cols.map(([key, label]) => ({ key, label })),
        groups,
      },
    };
  });
}

import { cached, getJson, isFootball, pathOf } from "./sports.js";
import { getPlayer } from "./football.js";

/*
 * Season tables for basketball, NFL, baseball and hockey players (ESPN keeps these current).
 * Football players show this season's numbers from the player page (see football.js) and link
 * out to other sites for deeper stats, so nothing here is football-specific.
 */

async function espnStats(league, id) {
  const info = await getPlayer(league, id);
  const j = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/${pathOf(league)}/athletes/${id}/stats`).catch(() => null);
  const categories = (j?.categories ?? [])
    .map((c) => {
      const labels = c.labels ?? [];
      const seasons = (c.statistics ?? []).map((s) => ({ season: s.season?.displayName ?? String(s.season?.year ?? ""), values: s.stats ?? [] }));
      const latest = seasons[seasons.length - 1];
      return {
        title: c.displayName ?? "",
        // The newest season as rows, ready to show and to compare.
        latestSeason: latest?.season ?? null,
        rows: latest ? labels.map((label, i) => ({ key: `${c.name}:${label}`, label, value: latest.values[i] ?? null, fmt: "text", better: null })).filter((r) => r.value !== null) : [],
      };
    })
    .filter((c) => c.rows.length);
  return {
    id,
    league,
    name: info.name,
    team: info.team,
    position: info.position,
    age: info.age,
    nationality: info.nationality,
    photo: info.photo,
    categories,
  };
}

export async function getPlayerStats({ league, id }) {
  if (!pathOf(league) || !/^\d+$/.test(id) || isFootball(league)) throw new Error("bad request");
  return cached(`pstats:${league}:${id}`, 6 * 3600_000, async () => ({ value: await espnStats(league, id) }));
}

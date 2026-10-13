import { cached, getJson, LEAGUES, SPORTS } from "./sports.js";

/*
 * Search across competitions (ours), plus teams and players (ESPN's search feed).
 * Players and teams come back with the competition they belong to so their pages can open.
 */

const SPORT_OF = { soccer: "football", basketball: "basketball", football: "american-football", baseball: "baseball", hockey: "hockey" };
const FALLBACK_LEAGUE = { football: "eng.1" };

const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export async function searchSports(rawQuery) {
  const q = String(rawQuery ?? "").trim().slice(0, 60);
  if (q.length < 2) return { competitions: [], teams: [], players: [] };
  const needle = plain(q);

  const competitions = [
    ...LEAGUES.filter((l) => plain(`${l.name} ${l.short} ${l.region}`).includes(needle)),
    ...SPORTS.filter((s) => plain(s.name).includes(needle)).flatMap((s) => LEAGUES.filter((l) => l.sport === s.id).slice(0, 1)),
  ]
    .filter((l, i, all) => all.findIndex((x) => x.id === l.id) === i)
    .slice(0, 8)
    .map((l) => ({ id: l.id, name: l.name, region: l.region, sport: l.sport }));

  const remote = await cached(`search:${needle}`, 10 * 60_000, async () => {
    const j = await getJson(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=10`);
    const out = { teams: [], players: [] };
    for (const group of j.results ?? []) {
      if (group.type !== "team" && group.type !== "player") continue;
      for (const c of group.contents ?? []) {
        const sport = SPORT_OF[c.sport];
        if (!sport) continue;
        const id = c.uid?.match(/~[at]:(\d+)$/)?.[1];
        if (!id) continue;
        // Football pages work under any football league path; other sports only for leagues we serve (no college teams).
        const league = LEAGUES.some((l) => l.id === c.defaultLeagueSlug && l.sport === sport) ? c.defaultLeagueSlug : sport === "football" ? FALLBACK_LEAGUE.football : null;
        if (!league) continue;
        const item = { id, name: c.displayName, subtitle: c.subtitle ?? c.description ?? "", league, sport };
        if (group.type === "team") out.teams.push({ ...item, logo: c.image?.default ?? null });
        else out.players.push(item);
      }
    }
    out.teams = out.teams.slice(0, 6);
    out.players = out.players.slice(0, 8);
    return { value: out };
  }).catch(() => ({ teams: [], players: [] }));

  return { competitions, ...remote };
}

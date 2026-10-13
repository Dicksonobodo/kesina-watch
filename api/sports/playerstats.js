import { getPlayerStats } from "../_lib/playerstats.js";

// GET /api/sports/playerstats?league=nba&id=1966: season tables for basketball / NFL / baseball / hockey players.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const stats = await getPlayerStats({ league: params.get("league") || "", id: params.get("id") || "" });
    return Response.json(stats, { headers: { "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    const bad = err.message === "bad request";
    return Response.json({ error: bad ? "Unknown player." : "Player stats are unavailable right now." }, { status: bad ? 400 : 502 });
  }
}

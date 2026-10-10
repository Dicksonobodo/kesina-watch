import { getPlayer } from "../_lib/football.js";

// GET /api/sports/player?league=eng.1&id=253989: player profile and season stats.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const player = await getPlayer(params.get("league") || "", params.get("id") || "");
    return Response.json(player, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (err) {
    return Response.json({ error: err.message === "bad request" ? "Unknown player." : "Player details are unavailable right now." }, { status: err.message === "bad request" ? 400 : 502 });
  }
}

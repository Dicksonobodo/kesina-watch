import { getTeam } from "../_lib/football.js";

// GET /api/sports/team?league=eng.1&id=382: fixtures, results and squad.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const team = await getTeam(params.get("league") || "", params.get("id") || "");
    return Response.json(team, { headers: { "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800" } });
  } catch (err) {
    return Response.json({ error: err.message === "bad request" ? "Unknown team." : "Team details are unavailable right now." }, { status: err.message === "bad request" ? 400 : 502 });
  }
}

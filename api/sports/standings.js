import { getStandings } from "../_lib/standings.js";

// GET /api/sports/standings?league=eng.1: the league table (or conference tables).
export async function GET(request) {
  const league = new URL(request.url).searchParams.get("league") || "eng.1";
  try {
    return Response.json(await getStandings(league), { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=900" } });
  } catch (err) {
    const bad = err.message === "bad request";
    return Response.json({ error: bad ? "Unknown competition." : "The table is unavailable right now." }, { status: bad ? 400 : 502 });
  }
}

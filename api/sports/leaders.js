import { getLeaders } from "../_lib/football.js";

// GET /api/sports/leaders?league=eng.1: top scorers, assists and more, counted from the matches.
export async function GET(request) {
  const league = new URL(request.url).searchParams.get("league") || "eng.1";
  try {
    return Response.json(await getLeaders(league), { headers: { "Cache-Control": "public, max-age=20, s-maxage=30, stale-while-revalidate=60" } });
  } catch (err) {
    return Response.json({ error: err.message === "bad request" ? "Unknown league." : "Top scorers are unavailable right now." }, { status: err.message === "bad request" ? 400 : 502 });
  }
}

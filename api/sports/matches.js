import { getMatches } from "../_lib/sports.js";

// GET /api/sports/matches?day=0&league=eng.1 — fixtures, live scores and results.
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const day = Math.max(-7, Math.min(7, Number(params.get("day")) || 0));
  const league = params.get("league") || undefined;
  const sport = params.get("sport") || "football";
  try {
    const data = await getMatches({ day, league, sport });
    // The CDN serves repeat visitors; live days refresh every 20s, quiet days every 2 minutes.
    const maxAge = data.live ? 20 : 120;
    return Response.json(data, {
      headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=300` },
    });
  } catch {
    return Response.json({ error: "Scores are unavailable right now. Try again in a minute." }, { status: 502 });
  }
}

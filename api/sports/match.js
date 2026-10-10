import { getMatch } from "../_lib/match.js";

// GET /api/sports/match?league=eng.1&id=401879268: match centre (timeline, line-ups, stats, table).
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const match = await getMatch({ league: params.get("league") || "", id: params.get("id") || "" });
    const maxAge = match.state === "in" ? 15 : match.state === "post" ? 3600 : 300;
    return Response.json(match, {
      headers: { "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=600` },
    });
  } catch (err) {
    const status = err.message === "bad match id" ? 400 : 502;
    return Response.json({ error: status === 400 ? "Unknown match." : "Match details are unavailable right now." }, { status });
  }
}

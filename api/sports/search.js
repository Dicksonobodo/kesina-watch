import { searchSports } from "../_lib/search.js";

// GET /api/sports/search?q=haaland: competitions, teams and players matching the text.
export async function GET(request) {
  const q = new URL(request.url).searchParams.get("q") || "";
  try {
    return Response.json(await searchSports(q), { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "Search is unavailable right now." }, { status: 502 });
  }
}

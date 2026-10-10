import { getNews } from "../_lib/sports.js";

// GET /api/sports/news — football headlines from official RSS feeds.
export async function GET() {
  try {
    return Response.json(
      { items: await getNews() },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" } },
    );
  } catch {
    return Response.json({ error: "News is unavailable right now." }, { status: 502 });
  }
}

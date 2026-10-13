import { getPhotos } from "../_lib/photos.js";

// GET /api/sports/photos?p=Erling Haaland|Manchester City&p=…: portrait URLs (null when none is found).
export async function GET(request) {
  const entries = new URL(request.url).searchParams
    .getAll("p")
    .map((v) => v.split("|"))
    .map(([name = "", team = ""]) => [name.trim(), team.trim()])
    .filter(([name]) => name);
  try {
    return Response.json({ photos: await getPhotos(entries) }, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000" } });
  } catch {
    return Response.json({ photos: {} }, { status: 502 });
  }
}

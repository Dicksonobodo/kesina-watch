import { getMatch } from "../_lib/match.js";

/**
 * ESPN only allows some clips in some countries (LaLiga clips: the US and Canada). Show each viewer
 * only the clips allowed where they are (Vercel says which country a request comes from).
 */
function forCountry(match, country) {
  if (!country) return { match, perViewer: false }; // local development: no country to go by
  const allowed = (c) => !c.geo || (c.geo.type === "whitelist" ? c.geo.countries.includes(country) : !c.geo.countries.includes(country));
  const restricted = match.highlights?.some((c) => c.geo);
  const highlights = (match.highlights ?? []).filter(allowed).map(({ geo, ...c }) => c);
  const kept = new Set(highlights.map((c) => c.id));
  const events = (match.events ?? []).map((e) => (e.clip && !kept.has(e.clip) ? { ...e, clip: undefined } : e));
  return { match: { ...match, highlights, events }, perViewer: Boolean(restricted) };
}

// GET /api/sports/match?league=eng.1&id=401879268: match centre (timeline, line-ups, stats, table).
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  try {
    const raw = await getMatch({ league: params.get("league") || "", id: params.get("id") || "" });
    const { match, perViewer } = forCountry(raw, request.headers.get("x-vercel-ip-country"));
    const maxAge = match.state === "in" ? 15 : match.state === "post" ? 3600 : 300;
    // A match whose clips depend on the country can't be shared from the CDN's cache.
    const cache = perViewer ? `private, max-age=${Math.min(maxAge, 300)}` : `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=600`;
    return Response.json(match, { headers: { "Cache-Control": cache } });
  } catch (err) {
    const status = err.message === "bad match id" ? 400 : 502;
    return Response.json({ error: status === 400 ? "Unknown match." : "Match details are unavailable right now." }, { status });
  }
}

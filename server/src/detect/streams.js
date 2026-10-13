/*
 * Telling several streams on one page apart, and naming them.
 *
 * A page can offer many live streams (channel lists, a row of cameras, event pages with
 * several feeds). Each candidate arrives with a "hint" (a label found next to it) and the
 * result groups sources into streams, each with a title the viewer recognises.
 */

const NOT_A_TITLE = /^(play|watch|live|video|player|stream|loading|click( here)?|close|menu|home|more|share|full ?screen|mute|ok|none|untitled)$/i;

/** A short, human label, or "" when the text is noise. */
export function cleanLabel(text, max = 60) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > max || NOT_A_TITLE.test(s)) return "";
  if (/^https?:\/\//i.test(s) || /^[\d\W_]+$/.test(s)) return "";
  return s;
}

const GENERIC_SEGMENT =
  /^(index|playlist|master|main|live|stream|streams|hls|manifest|chunklist|video|videos|media|m3u8|dash|mpd|sd|hd|high|low|medium|auto|abr|prog_index|out|output|play|channel|channels|cdn|content|vod|stable|primary|backup|stream\d*|chunks?|segments?|variant|origin|edge|playout)$/i;

/** "/live/arise-news/index.m3u8" → "Arise News"; null when the address says nothing readable. */
export function nameFromUrl(url) {
  let segments;
  try {
    segments = new URL(url).pathname.split("/").filter(Boolean).reverse();
  } catch {
    return null;
  }
  for (const raw of segments.slice(0, 4)) {
    let seg;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      seg = raw;
    }
    seg = seg.replace(/\.(m3u8|mpd|mp4|webm|mkv|mov|php|html?|aspx?)$/i, "");
    if (!seg || GENERIC_SEGMENT.test(seg)) continue;
    // Tokens, ids and hashes are not names.
    if (/^[\da-f-]{16,}$/i.test(seg) || /^\d+$/.test(seg) || seg.length > 40 || /[A-Za-z0-9+/_-]{24,}/.test(seg)) continue;
    if (seg.length >= 6 && /\d/.test(seg) && /[a-z]/i.test(seg) && !/[-_. ]/.test(seg)) continue; // looks like an id (x36xhzz)
    const words = seg.replace(/[-_.+]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
    if (words.length < 3 || !/[a-z]{3}/i.test(words)) continue;
    return words === words.toLowerCase() ? words.replace(/\b\w/g, (c) => c.toUpperCase()) : words;
  }
  return null;
}

/**
 * IPTV-style channel list: #EXTINF:-1 tvg-name="…",Channel name followed by the stream address.
 * (A normal media playlist has positive #EXTINF durations and segment addresses instead.)
 */
export function parseChannelList(text, baseUrl) {
  if (/#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXTINF:")) continue;
    const duration = Number(line.match(/^#EXTINF:(-?[\d.]+)/)?.[1]);
    if (duration > 0 && !/tvg-|group-title/.test(line)) continue;
    const name = cleanLabel(line.match(/tvg-name="([^"]+)"/)?.[1] || line.slice(line.lastIndexOf(",") + 1));
    const uri = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#"));
    if (!uri) continue;
    try {
      out.push({ name, url: new URL(uri.trim(), baseUrl).href });
    } catch {
      /* skip a broken address */
    }
  }
  return out;
}

/**
 * Groups probed sources into streams (one per master playlist / address) and names them.
 * Returns { streams, sources } where every source gains streamId and streamTitle.
 */
export function groupStreams(sources, { pageTitle = "" } = {}) {
  const byKey = new Map();
  for (const s of sources) {
    const key = s.masterUrl || s.url;
    if (!byKey.has(key)) byKey.set(key, { key, sources: [] });
    byKey.get(key).sources.push(s);
  }

  let groups = [...byKey.values()].map((g) => {
    const live = g.sources.some((s) => s.live);
    const hint = g.sources.map((s) => cleanLabel(s.hint)).find(Boolean) || "";
    const exact = hint || nameFromUrl(g.key) || ""; // a name the page or address really gave this stream
    const frameName = g.sources.map((s) => cleanLabel(s.frameHint)).find(Boolean) || "";
    return { ...g, live, hint, exact, title: exact || frameName };
  });

  // The same named stream seen as separate quality playlists: one stream, several qualities.
  const named = new Map();
  groups = groups.filter((g) => {
    if (!g.exact) return true;
    const id = `${g.live}:${g.exact.toLowerCase()}`;
    const first = named.get(id);
    if (!first) {
      named.set(id, g);
      return true;
    }
    first.sources.push(...g.sources);
    return false;
  });

  // Live first (stable otherwise), a cap so a huge channel list stays usable.
  groups = groups.map((g, i) => ({ ...g, order: i })).sort((a, b) => Number(b.live) - Number(a.live) || a.order - b.order).slice(0, 24);

  const used = new Map();
  let fallback = 0;
  const streams = groups.map((g, i) => {
    // A page with one stream: the page's own title beats a name guessed from the address.
    let title = groups.length === 1 && !g.hint && pageTitle ? pageTitle : g.title;
    if (!title) {
      fallback++;
      title = groups.length === 1 && pageTitle ? pageTitle : `${g.live ? "Live stream" : "Video"} ${fallback}`;
    }
    const seen = used.get(title.toLowerCase()) ?? 0;
    used.set(title.toLowerCase(), seen + 1);
    if (seen) title = `${title} (${seen + 1})`;
    const id = `st${i}`;
    for (const s of g.sources) Object.assign(s, { streamId: id, streamTitle: title });
    return {
      id,
      title,
      live: g.live,
      qualities: [...new Set(g.sources.map((s) => s.quality).filter(Boolean))],
      sourceIds: g.sources.map((s) => s.id),
    };
  });

  return { streams, sources: groups.flatMap((g) => g.sources) };
}

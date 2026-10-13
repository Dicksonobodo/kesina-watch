const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");

/**
 * @param dl       file name: the relay asks the browser to save instead of play
 * @param rewrite  for playlists: every piece inside is also routed through the relay (player)
 */
export function relayUrl(source, url, { dl, rewrite } = {}) {
  const params = new URLSearchParams({ t: source.relayToken, url });
  if (dl) params.set("dl", dl);
  if (rewrite) params.set("rw", "1");
  return `${API_URL}/relay?${params}`;
}

export const canRelay = (source) => Boolean(API_URL && source?.relayToken);

/**
 * Relay address that mirrors the real one (/relay/m/<token>/https/host/path?query), so a DASH
 * manifest's relative segment addresses resolve back into the relay. Relay addresses pass
 * through unchanged.
 */
export function relayMirrorUrl(source, url) {
  if (url.startsWith(`${API_URL}/relay`)) return url;
  const u = new URL(url);
  return `${API_URL}/relay/m/${source.relayToken}/${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}`;
}

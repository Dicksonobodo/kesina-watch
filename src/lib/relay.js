import { serverUrl } from "./server";

// The relay lives on the Live server; its address is found when the page loads (lib/server.js).

/**
 * @param dl       file name: the relay asks the browser to save instead of play
 * @param rewrite  for playlists: every piece inside is also routed through the relay (player)
 */
export function relayUrl(source, url, { dl, rewrite } = {}) {
  const params = new URLSearchParams({ t: source.relayToken, url });
  if (dl) params.set("dl", dl);
  if (rewrite) params.set("rw", "1");
  return `${serverUrl()}/relay?${params}`;
}

export const canRelay = (source) => Boolean(serverUrl() && source?.relayToken);

/**
 * Relay address that mirrors the real one (/relay/m/<token>/https/host/path?query), so a DASH
 * manifest's relative segment addresses resolve back into the relay. Relay addresses pass
 * through unchanged.
 */
export function relayMirrorUrl(source, url) {
  const base = serverUrl();
  if (url.startsWith(`${base}/relay`)) return url;
  const u = new URL(url);
  return `${base}/relay/m/${source.relayToken}/${u.protocol.slice(0, -1)}/${u.host}${u.pathname}${u.search}`;
}

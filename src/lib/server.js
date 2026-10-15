import { useEffect, useState } from "react";

/*
 * Where the Live (detection) server is. It runs on a laptop behind a tunnel whose address changes
 * each time it starts, so the address isn't built into the site: the laptop saves it (server/
 * scripts/go-live.mjs) and the site asks /api/games?what=server. VITE_API_URL still works: on this
 * computer (a localhost address) it's used straight away, and on the web it's the fallback.
 */

const BUILT = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
const onThisComputer = typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const builtIsLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BUILT);
// A localhost address only means something on the computer the server runs on.
const fallback = BUILT && (!builtIsLocal || onThisComputer) ? BUILT : "";

let current = onThisComputer && builtIsLocal ? BUILT : "";
let loading = null;
let checkedAt = 0;
const listeners = new Set();

const set = (url) => {
  if (url === current) return;
  current = url;
  for (const fn of listeners) fn(url);
};

/** The address known right now ("" when there's no server). */
export const serverUrl = () => current;

/** Finds the address (once; later calls reuse the answer). Resolves to "" when the server is offline. */
export function loadServerUrl() {
  if (onThisComputer && builtIsLocal) return Promise.resolve(current);
  loading ??= fetch("/api/games?what=server", { signal: AbortSignal.timeout(6000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      checkedAt = Date.now();
      set(d?.online && d.url ? d.url.replace(/\/$/, "") : fallback);
      return current;
    })
    .catch(() => {
      set(current || fallback);
      return current;
    });
  return loading;
}

/** Asks again (the laptop may have restarted with a new address). At most every 10 seconds. */
export function refreshServerUrl() {
  if (onThisComputer && builtIsLocal) return Promise.resolve(current);
  if (Date.now() - checkedAt > 10_000) loading = null;
  return loadServerUrl();
}

/** The address, for components: re-renders when it's found or changes. */
export function useServerUrl() {
  const [url, setUrl] = useState(current);
  useEffect(() => {
    listeners.add(setUrl);
    loadServerUrl().then(setUrl);
    return () => listeners.delete(setUrl);
  }, []);
  return url;
}

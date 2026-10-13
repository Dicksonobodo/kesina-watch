const TTL_MS = 10 * 60 * 1000;
const MAX = 300;
const store = new Map();

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.until) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

/** ttlMs defaults to 10 minutes; callers shorten it for empty results and expiring links. */
export function setCached(key, value, ttlMs = TTL_MS) {
  if (ttlMs <= 0) return;
  if (store.size >= MAX) store.delete(store.keys().next().value);
  store.set(key, { until: Date.now() + Math.min(ttlMs, TTL_MS), value });
}

const TTL_MS = 10 * 60 * 1000;
const MAX = 300;
const store = new Map();

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(key, value) {
  if (store.size >= MAX) store.delete(store.keys().next().value);
  store.set(key, { at: Date.now(), value });
}

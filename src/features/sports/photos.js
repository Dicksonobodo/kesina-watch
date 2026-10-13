import { useEffect, useState } from "react";

/*
 * Player portraits. Lists show dozens of players, so lookups are batched into one request
 * (/api/sports/photos) and remembered for the session. Nothing found = the initials badge stays.
 */

const cache = new Map(); // "name|team" → url | null
const listeners = new Map(); // key → Set<fn>
const pending = new Set();
let timer = null;

const keyOf = (name, team) => `${name}|${team || ""}`;

function flush() {
  timer = null;
  const keys = [...pending].sort();
  pending.clear();
  for (let i = 0; i < keys.length; i += 16) {
    const chunk = keys.slice(i, i + 16);
    const params = new URLSearchParams();
    chunk.forEach((k) => params.append("p", k));
    fetch(`/api/sports/photos?${params}`, { signal: AbortSignal.timeout(20_000) })
      .then((res) => res.json())
      .catch(() => ({ photos: {} }))
      .then(({ photos = {} }) => {
        for (const k of chunk) {
          cache.set(k, photos[k] ?? null);
          listeners.get(k)?.forEach((fn) => fn(photos[k] ?? null));
        }
      });
  }
}

export function usePlayerPhoto(name, team = "") {
  const key = name ? keyOf(name, team) : null;
  const [photo, setPhoto] = useState(() => (key ? cache.get(key) ?? null : null));

  useEffect(() => {
    if (!key) return undefined;
    if (cache.has(key)) {
      setPhoto(cache.get(key));
      return undefined;
    }
    const set = listeners.get(key) ?? new Set();
    set.add(setPhoto);
    listeners.set(key, set);
    pending.add(key);
    timer ??= setTimeout(flush, 80);
    return () => set.delete(setPhoto);
  }, [key]);

  return photo;
}

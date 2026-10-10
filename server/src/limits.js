import { config } from "./config.js";
import { HttpError } from "./safety.js";

const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

// Forget visitors whose requests are all older than the window, so the map can't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, times] of hits) if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key);
}, 60_000).unref();

export function rateLimit(req, res, next) {
  const key = req.uid || req.ip;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  // Premium members get three times the allowance.
  if (recent.length >= config.rateLimit * (req.premium ? 3 : 1)) {
    return res.status(429).json({ error: "You're detecting a lot. Take a short break and try again in a few minutes." });
  }
  recent.push(now);
  hits.set(key, recent);
  next();
}

/**
 * Caps how many tasks run at once, with a bounded waiting line: when the line is full,
 * or a task waits too long, the caller gets a clear "busy" error instead of hanging.
 */
export function createLimiter(max, { maxQueue = 20, waitMs = 30_000 } = {}) {
  let active = 0;
  const queue = [];

  const release = () => {
    active--;
    queue.shift()?.resolve();
  };

  const run = async (task) => {
    if (active >= max) {
      if (queue.length >= maxQueue) throw new HttpError(503, "Dixon Watch is very busy right now. Try again in a minute.");
      await new Promise((resolve, reject) => {
        const entry = { resolve: () => (clearTimeout(timer), resolve()) };
        const timer = setTimeout(() => {
          queue.splice(queue.indexOf(entry), 1);
          reject(new HttpError(503, "Dixon Watch is very busy right now. Try again in a minute."));
        }, waitMs);
        queue.push(entry);
      });
    }
    active++;
    try {
      return await task();
    } finally {
      release();
    }
  };
  run.stats = () => ({ active, waiting: queue.length, max });
  return run;
}

/** Tracks open streams per user and overall (relay). Returns a release function or null when full. */
export function createSlots({ perUser, total }) {
  const byUser = new Map();
  let open = 0;
  const acquire = (key, limit = perUser) => {
    const mine = byUser.get(key) ?? 0;
    if (mine >= limit || open >= total) return null;
    byUser.set(key, mine + 1);
    open++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      open--;
      const left = (byUser.get(key) ?? 1) - 1;
      if (left <= 0) byUser.delete(key);
      else byUser.set(key, left);
    };
  };
  acquire.stats = () => ({ open, users: byUser.size, total });
  return acquire;
}

/** Rejects with a 504 if the work takes longer than ms. */
export function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

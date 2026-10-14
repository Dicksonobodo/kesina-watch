import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { setBoardScore } from "./leaderboard.js";
import { GameError, newId, rateLimit } from "./util.js";

/*
 * Keepie-uppie: a skill game played in the browser (tap the ball to keep it up). The server times
 * the run, so a score is only accepted if it could have been reached in the time that passed, and
 * keeps the best scores on the boards.
 */

const MIN_GAP_MS = 180; // the fastest a ball can come back down and be hit again
const MAX_SCORE = 400;

export async function startKeepy(identity) {
  rateLimit(`keepy:${identity.uid}`, 30);
  const id = newId(12);
  const store = await getStore();
  await store.set(`sessions/${id}`, { uid: identity.uid, kind: "keepy", status: "active", startedAt: Date.now() });
  return { session: id };
}

export async function finishKeepy(identity, id, score) {
  rateLimit(`keepyf:${identity.uid}`, 30);
  const store = await getStore();
  const s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid || s.kind !== "keepy") throw new GameError("That run wasn't found.", 404);
  if (s.status !== "active") throw new GameError("That run was already saved.");
  s.status = "done";
  await store.set(`sessions/${id}`, s);

  const elapsed = Date.now() - s.startedAt;
  let hits = Math.floor(Number(score));
  if (!Number.isFinite(hits) || hits < 0) hits = 0;
  hits = Math.min(hits, MAX_SCORE, Math.floor(elapsed / MIN_GAP_MS)); // can't have more hits than time allows

  const profile = await getProfile(identity);
  const previous = profile.stats.keepyBest ?? 0;
  const best = Math.max(previous, hits);
  const [reward] = await Promise.all([
    award(identity, { profile, xp: Math.min(hits, 80) + 2, coins: Math.floor(hits / 8), stats: { keepyRuns: 1 }, setStats: { keepyBest: best } }),
    hits > 0 ? Promise.all([setBoardScore("keepyWeekly", identity, profile, hits), setBoardScore("keepyAll", identity, profile, hits)]) : null,
  ]);
  return { score: hits, best, record: hits > previous, reward };
}

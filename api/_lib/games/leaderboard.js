import { getStore, inc, writeVersion } from "./store.js";
import { dayKey, GameError, memo, msToWeekEnd, weekKey } from "./util.js";

/*
 * Leaderboards: one small document per player per board, ordered by one number. Top 50 only
 * (keeps Firestore reads low); results are cached for a few seconds per instance.
 */

const BOARDS = {
  weekly: { collection: () => `lb_weekly_${weekKey()}`, field: "xp", title: "This week", unit: "XP", resets: true },
  all: { collection: () => "lb_all", field: "xp", title: "All time", unit: "XP" },
  daily: { collection: () => `lb_daily_${dayKey()}`, field: "score", title: "Today's daily challenges", unit: "pts" },
  predWeekly: { collection: () => `lb_pred_${weekKey()}`, field: "pts", title: "Predictions this week", unit: "pts", resets: true },
  hiloWeekly: { collection: () => `lb_hilo_${weekKey()}`, field: "best", title: "Higher or Lower (week)", unit: "streak", resets: true },
  hiloAll: { collection: () => "lb_hilo_all", field: "best", title: "Higher or Lower (all time)", unit: "streak" },
  keepyWeekly: { collection: () => `lb_keepy_${weekKey()}`, field: "best", title: "Keepie-Uppie (week)", unit: "touches", resets: true },
  keepyAll: { collection: () => "lb_keepy_all", field: "best", title: "Keepie-Uppie (all time)", unit: "touches" },
  grid: { collection: () => `lb_grid_${dayKey()}`, field: "score", title: "Today's club grid", unit: "pts" },
  predAll: { collection: () => "lb_pred_all", field: "pts", title: "Predictions all time", unit: "pts" },
};

export const boardNames = Object.keys(BOARDS);

export async function getBoard(name, uid) {
  const board = BOARDS[name];
  if (!board) throw new GameError("Unknown leaderboard.");
  const collection = board.collection();
  // Cached for a few seconds, but dropped as soon as anything is written, so your own score shows up at once.
  const rows = await memo(`lb:${collection}`, 8_000, writeVersion(), async () => {
    const store = await getStore();
    return store.list(collection, { orderBy: board.field, desc: true, limit: 50 });
  });
  const entries = rows.map((r, i) => ({ rank: i + 1, uid: r.id, name: r.name ?? "Player", avatar: r.avatar ?? "⚽", theme: r.theme ?? "lime", value: r[board.field] ?? 0, me: r.id === uid }));
  let me = entries.find((e) => e.me) ?? null;
  if (!me && uid) {
    const mine = await (await getStore()).get(`${collection}/${uid}`);
    if (mine) me = { rank: null, uid, name: mine.name, avatar: mine.avatar ?? "⚽", theme: mine.theme ?? "lime", value: mine[board.field] ?? 0, me: true };
  }
  return { board: name, title: board.title, unit: board.unit, entries, me, resetsInMs: board.resets ? msToWeekEnd() : null };
}

/** Writes or raises a player's score on a board (keeps the best value for "best score" boards). */
export async function setBoardScore(name, identity, profile, value, { keepBest = true, extra = {} } = {}) {
  const board = BOARDS[name];
  const store = await getStore();
  const path = `${board.collection()}/${identity.uid}`;
  const current = await store.get(path);
  if (keepBest && current && (current[board.field] ?? 0) >= value) return;
  await store.set(path, { name: profile.name, avatar: profile.avatar, theme: profile.theme, [board.field]: value, ...extra });
}

/** Adds to a player's running total on a board. */
export async function addBoardPoints(name, identity, profile, delta) {
  const board = BOARDS[name];
  const store = await getStore();
  // One write: the database adds the points itself, so there is nothing to read first.
  await store.set(`${board.collection()}/${identity.uid}`, { name: profile.name, avatar: profile.avatar, theme: profile.theme, [board.field]: inc(delta) }, { merge: true });
}

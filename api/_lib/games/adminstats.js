import { getStore, writeVersion } from "./store.js";
import { dayKey, memo } from "./util.js";

/*
 * Numbers for the admin dashboard. Counts use aggregate queries (cheap), and the whole answer is
 * kept for a few seconds, and dropped as soon as anything is written (so new activity shows up at once).
 */

export const adminStats = () =>
  memo("games:adminstats", 8_000, writeVersion(), async () => {
    const store = await getStore();
    const today = dayKey();
    const weekAgo = dayKey(new Date(Date.now() - 6 * 86_400_000));
    const startOfDay = Date.parse(`${today}T00:00:00Z`);
    const c = (collection, where) => store.count(collection, where).catch(() => null);

    const [players, activeToday, activeWeek, newToday, startedToday, finishedToday, open, settled, predsToday, roomsToday, roomsDone, qPending, qApproved, qHidden, leagues, recent, top] = await Promise.all([
      c("gp"),
      c("gp", [["lastSeenDay", "==", today]]),
      c("gp", [["lastSeenDay", ">=", weekAgo]]),
      c("gp", [["createdAt", ">=", startOfDay]]),
      c("sessions", [["day", "==", today]]),
      c("sessions", [["day", "==", today], ["status", "==", "done"]]),
      c("predictions", [["status", "==", "open"]]),
      c("predictions", [["status", "==", "settled"]]),
      c("predictions", [["createdAt", ">=", startOfDay]]),
      c("rooms", [["createdAt", ">=", startOfDay]]),
      c("rooms", [["status", "==", "done"]]),
      c("questions", [["status", "==", "pending"]]),
      c("questions", [["status", "==", "approved"]]),
      c("questions", [["status", "==", "hidden"]]),
      c("pleagues"),
      store.list("gp", { orderBy: "createdAt", desc: true, limit: 8 }).catch(() => []),
      store.list("lb_all", { orderBy: "xp", desc: true, limit: 5 }).catch(() => []),
    ]);

    return {
      at: Date.now(),
      day: today,
      players: { total: players, activeToday, activeWeek, newToday },
      activity: { gamesStartedToday: startedToday, gamesFinishedToday: finishedToday, predictionsToday: predsToday, battlesToday: roomsToday, battlesFinished: roomsDone, leagues },
      predictions: { open, settled },
      questions: { pending: qPending, approved: qApproved, hidden: qHidden },
      recentPlayers: recent.map((p) => ({ uid: p.id, name: p.name, avatar: p.avatar, level: Math.floor(Math.sqrt(Math.max(0, p.xp ?? 0) / 40)) + 1, xp: p.xp ?? 0, streak: p.streak ?? 0, createdAt: p.createdAt, lastDay: p.lastDay })),
      topPlayers: top.map((p, i) => ({ rank: i + 1, uid: p.id, name: p.name, avatar: p.avatar, xp: p.xp })),
    };
  });

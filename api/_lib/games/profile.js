import { getStore, inc } from "./store.js";
import { dayKey, GameError, weekKey, yesterdayKey } from "./util.js";

/*
 * Every player's game profile: XP and level, coins, daily streak, achievements, cosmetics.
 * All changes go through award() so XP, boards, streaks and achievements stay consistent.
 */

export const levelFor = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 40)) + 1;
export const xpForLevel = (level) => 40 * (level - 1) ** 2;

/* ---------- cosmetics ---------- */

export const AVATARS = [
  { id: "⚽", cost: 0 },
  { id: "🧤", cost: 0 },
  { id: "👟", cost: 0 },
  { id: "🏆", cost: 120 },
  { id: "🦁", cost: 150 },
  { id: "🦅", cost: 150 },
  { id: "🐺", cost: 200 },
  { id: "🔥", cost: 250 },
  { id: "🚀", cost: 300 },
  { id: "🐉", cost: 400 },
  { id: "👑", cost: 600 },
];

export const THEMES = [
  { id: "lime", name: "Lime", color: "#c6ff3d", cost: 0 },
  { id: "sky", name: "Sky", color: "#4cc9f0", cost: 150 },
  { id: "rose", name: "Rose", color: "#ff5d8f", cost: 150 },
  { id: "gold", name: "Gold", color: "#ffc53d", cost: 300 },
  { id: "violet", name: "Violet", color: "#a78bfa", cost: 300 },
];

/* ---------- achievements ---------- */

// check(profile) is evaluated after every award; each achievement unlocks once.
export const ACHIEVEMENTS = [
  { id: "first-whistle", icon: "🟢", name: "First whistle", desc: "Play your first game", xp: 20, coins: 10, check: (p) => p.stats.games >= 1 },
  { id: "quiz-master", icon: "🧠", name: "Quiz master", desc: "Get a perfect score in a quiz", xp: 60, coins: 40, check: (p) => p.stats.perfectQuizzes >= 1 },
  { id: "scholar", icon: "📚", name: "Scholar", desc: "Answer 100 questions correctly", xp: 80, coins: 50, check: (p) => p.stats.quizCorrect >= 100 },
  { id: "hat-trick", icon: "🎩", name: "Hat-trick hero", desc: "Predict 3 exact scores", xp: 80, coins: 60, check: (p) => p.stats.predExact >= 3 },
  { id: "perfect-predictor", icon: "🔮", name: "Perfect predictor", desc: "Get 5 results right in a row", xp: 100, coins: 80, check: (p) => p.stats.predRunBest >= 5 },
  { id: "on-fire", icon: "🔥", name: "On fire", desc: "Play 7 days in a row", xp: 70, coins: 50, check: (p) => p.bestStreak >= 7 },
  { id: "marathon", icon: "🏃", name: "Marathon", desc: "Play 30 days in a row", xp: 250, coins: 200, check: (p) => p.bestStreak >= 30 },
  { id: "daily-devotee", icon: "📅", name: "Daily devotee", desc: "Finish 10 daily challenges", xp: 80, coins: 60, check: (p) => p.stats.dailyDone >= 10 },
  { id: "team-player", icon: "🤝", name: "Team player", desc: "Join a friends league", xp: 30, coins: 20, check: (p) => p.stats.leaguesJoined >= 1 },
  { id: "rival", icon: "⚔️", name: "Rival", desc: "Win a head-to-head battle", xp: 60, coins: 40, check: (p) => p.stats.battlesWon >= 1 },
  { id: "unbeaten", icon: "🛡️", name: "Unbeaten", desc: "Win 5 head-to-head battles", xp: 120, coins: 90, check: (p) => p.stats.battlesWon >= 5 },
  { id: "scout", icon: "🔎", name: "Scout", desc: "Guess a player in 2 clues or fewer", xp: 80, coins: 50, check: (p) => p.stats.guessFast >= 1 },
  { id: "contributor", icon: "✍️", name: "Contributor", desc: "Have a question you wrote approved", xp: 70, coins: 50, check: (p) => p.stats.questionsApproved >= 1 },
  { id: "level-5", icon: "⭐", name: "Rising star", desc: "Reach level 5", xp: 50, coins: 40, check: (p) => levelFor(p.xp) >= 5 },
  { id: "level-10", icon: "🌟", name: "Superstar", desc: "Reach level 10", xp: 150, coins: 120, check: (p) => levelFor(p.xp) >= 10 },
];

/* ---------- profile ---------- */

const blankStats = () => ({
  games: 0, quizzes: 0, quizCorrect: 0, perfectQuizzes: 0, predictions: 0, predCorrect: 0, predExact: 0, predRun: 0, predRunBest: 0,
  dailyDone: 0, leaguesJoined: 0, battles: 0, battlesWon: 0, guessWins: 0, guessFast: 0, questionsApproved: 0,
});

const publicName = (name) => String(name || "Player").replace(/[^\p{L}\p{N} ._'-]/gu, "").trim().slice(0, 20) || "Player";

export async function getProfile(identity) {
  const store = await getStore();
  let p = await store.get(`gp/${identity.uid}`);
  if (!p) {
    p = {
      uid: identity.uid,
      name: publicName(identity.name),
      avatar: "⚽",
      theme: "lime",
      xp: 0,
      coins: 0,
      streak: 0,
      bestStreak: 0,
      lastDay: null,
      weekKey: weekKey(),
      weeklyXp: 0,
      achievements: {},
      owned: AVATARS.filter((a) => a.cost === 0).map((a) => a.id).concat(["lime"]),
      leagues: [],
      stats: blankStats(),
      createdAt: Date.now(),
    };
    await store.set(`gp/${identity.uid}`, p);
  }
  // Fill in anything added after the profile was created.
  p.stats = { ...blankStats(), ...(p.stats ?? {}) };
  p.achievements ??= {};
  p.leagues ??= [];
  return p;
}

/** What the client needs to draw a profile. */
export function viewProfile(p, identity) {
  const level = levelFor(p.xp);
  const sameWeek = p.weekKey === weekKey();
  return {
    uid: p.uid,
    name: p.name,
    avatar: p.avatar,
    theme: p.theme,
    xp: p.xp,
    level,
    levelFloor: xpForLevel(level),
    levelCeil: xpForLevel(level + 1),
    coins: p.coins,
    streak: p.lastDay === dayKey() || p.lastDay === yesterdayKey() ? p.streak : 0,
    playedToday: p.lastDay === dayKey(),
    bestStreak: p.bestStreak,
    weeklyXp: sameWeek ? p.weeklyXp : 0,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, name: a.name, desc: a.desc, xp: a.xp, coins: a.coins, unlockedAt: p.achievements[a.id] ?? null })),
    owned: p.owned,
    stats: p.stats,
    leagues: p.leagues,
    admin: Boolean(identity?.admin),
    shop: { avatars: AVATARS, themes: THEMES },
  };
}

/**
 * Gives XP and coins, updates the streak and stats, writes the boards and checks achievements.
 * `stats` adds to counters; `setStats` overwrites some (like a running streak of correct predictions).
 */
export async function award(identity, { xp = 0, coins = 0, stats = {}, setStats = {}, game = true } = {}) {
  const store = await getStore();
  const p = await getProfile(identity);
  const today = dayKey();
  const week = weekKey();
  const before = levelFor(p.xp);

  // Daily streak: the first game of a day extends it (or restarts it after a missed day).
  let streakBonus = 0;
  if (game && p.lastDay !== today) {
    p.streak = p.lastDay === yesterdayKey() ? p.streak + 1 : 1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.lastDay = today;
    streakBonus = Math.min(p.streak, 10) * 5;
    xp += streakBonus;
    coins += Math.min(p.streak, 10);
  }

  p.xp += xp;
  p.coins += coins;
  if (p.weekKey !== week) {
    p.weekKey = week;
    p.weeklyXp = 0;
  }
  p.weeklyXp += xp;
  if (game) p.stats.games += 1;
  for (const [k, v] of Object.entries(stats)) p.stats[k] = (p.stats[k] ?? 0) + v;
  Object.assign(p.stats, setStats);

  // Achievements (and the XP/coins they pay, which can unlock more).
  const unlocked = [];
  for (let pass = 0; pass < 3; pass++) {
    let any = false;
    for (const a of ACHIEVEMENTS) {
      if (!p.achievements[a.id] && a.check(p)) {
        p.achievements[a.id] = Date.now();
        p.xp += a.xp;
        p.coins += a.coins;
        p.weeklyXp += a.xp;
        unlocked.push({ id: a.id, icon: a.icon, name: a.name, xp: a.xp, coins: a.coins });
        any = true;
      }
    }
    if (!any) break;
  }

  await store.set(`gp/${identity.uid}`, p);
  const entry = { name: p.name, avatar: p.avatar, theme: p.theme };
  await Promise.all([
    store.set(`lb_weekly_${week}/${identity.uid}`, { ...entry, xp: p.weeklyXp }),
    store.set(`lb_all/${identity.uid}`, { ...entry, xp: p.xp }),
  ]);

  const level = levelFor(p.xp);
  return {
    xp: p.xp,
    gainedXp: xp + unlocked.reduce((n, a) => n + a.xp, 0),
    gainedCoins: coins + unlocked.reduce((n, a) => n + a.coins, 0),
    coins: p.coins,
    level,
    leveledUp: level > before,
    streak: p.streak,
    streakBonus,
    achievements: unlocked,
  };
}

/* ---------- editing ---------- */

export async function setName(identity, name) {
  const clean = publicName(name);
  if (clean.length < 2) throw new GameError("Pick a name with at least 2 letters or numbers.");
  const store = await getStore();
  const p = await getProfile(identity);
  p.name = clean;
  await store.set(`gp/${identity.uid}`, p);
  const week = weekKey();
  await Promise.all([
    store.set(`lb_all/${identity.uid}`, { name: clean }, { merge: true }),
    store.set(`lb_weekly_${week}/${identity.uid}`, { name: clean }, { merge: true }),
  ]);
  return p;
}

export async function buy(identity, kind, id) {
  const item = (kind === "avatar" ? AVATARS : kind === "theme" ? THEMES : []).find((i) => i.id === id);
  if (!item) throw new GameError("That item doesn't exist.");
  const store = await getStore();
  const p = await getProfile(identity);
  if (p.owned.includes(id)) throw new GameError("You already own that.");
  if (p.coins < item.cost) throw new GameError(`You need ${item.cost - p.coins} more coins.`);
  p.coins -= item.cost;
  p.owned.push(id);
  await store.set(`gp/${identity.uid}`, p);
  return p;
}

export async function equip(identity, kind, id) {
  const store = await getStore();
  const p = await getProfile(identity);
  if (!p.owned.includes(id)) throw new GameError("Buy it first.");
  if (kind === "avatar") p.avatar = id;
  else if (kind === "theme") p.theme = id;
  else throw new GameError("Unknown item.");
  await store.set(`gp/${identity.uid}`, p);
  const week = weekKey();
  const entry = { avatar: p.avatar, theme: p.theme };
  await Promise.all([store.set(`lb_all/${identity.uid}`, entry, { merge: true }), store.set(`lb_weekly_${week}/${identity.uid}`, entry, { merge: true })]);
  return p;
}

export { inc };

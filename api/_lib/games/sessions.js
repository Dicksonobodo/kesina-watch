import { buildQuiz, shuffleQuestion } from "./questions.js";
import { careerQuestions } from "./clubgames.js";
import { hiloQuestions } from "./hilo.js";
import { bothClubsQuestions, shirtQuestions, trophyQuestions, xiQuestions } from "./content.js";
import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { addBoardPoints } from "./leaderboard.js";
import { dayKey, GameError, newId, rngFrom } from "./util.js";

/*
 * One engine for every "answer a series of questions" game: quiz, daily quiz, guess the shirt
 * number, who played for both clubs, name the trophy and complete the XI.
 *
 * The server keeps the answers. A question is sent without its answer, the clock starts when it
 * is sent, and the answer endpoint scores it (right answer + speed) and sends the next question.
 */

export const KINDS = {
  quiz: { title: "Football IQ quiz", count: 10, seconds: 15 },
  daily: { title: "Daily quiz", count: 10, seconds: 15 },
  shirt: { title: "Guess the shirt number", count: 8, seconds: 15 },
  clubs: { title: "Who played for both?", count: 8, seconds: 20 },
  trophy: { title: "Name the trophy", count: 8, seconds: 20 },
  xi: { title: "Complete the XI", count: 3, seconds: 25 },
  career: { title: "Career path", count: 8, seconds: 20 },
  hilo: { title: "Higher or Lower", count: 10, seconds: 12 },
};

const BASE_POINTS = { easy: 80, medium: 100, hard: 130 };
const GRACE_MS = 3000;

export async function questionsFor(kind, { difficulty, seed }) {
  const { count } = KINDS[kind];
  const rng = seed ? rngFrom(seed) : Math.random;
  if (kind === "quiz") return buildQuiz({ difficulty, count });
  if (kind === "daily") return buildQuiz({ difficulty: "mixed", count, seed: `daily-${seed}`, excludeVolatile: true });
  let qs;
  if (kind === "clubs") qs = bothClubsQuestions(count, rng);
  else if (kind === "trophy") qs = trophyQuestions(count, rng);
  else if (kind === "shirt") qs = await shirtQuestions(count, rng);
  else if (kind === "xi") qs = await xiQuestions(seed || dayKey(), rng);
  else if (kind === "career") qs = careerQuestions(count, rng);
  else if (kind === "hilo") qs = await hiloQuestions(count);
  else throw new GameError("Unknown game.");
  // The builders list the right answer first: mix the options so it can be anywhere.
  return qs.map((q) => shuffleQuestion(q, rng));
}

// A question the player sees: no answer, no internals.
const publicQuestion = (s, i) => {
  const q = s.qs[i];
  return {
    id: q.id,
    text: q.text,
    options: q.options,
    category: q.category,
    difficulty: q.difficulty,
    source: q.source,
    by: q.by ?? null,
    meta: q.meta ?? null,
    index: i,
    total: s.qs.length,
    seconds: s.seconds,
  };
};

export async function startSession(identity, { kind, difficulty = "mixed" }) {
  const spec = KINDS[kind];
  if (!spec) throw new GameError("Unknown game.");
  const store = await getStore();
  const today = dayKey();

  if (kind === "daily") {
    const done = await store.get(`daily_${today}/${identity.uid}`);
    if (done?.quiz != null) throw new GameError("You've already played today's daily quiz. Come back tomorrow!");
  }
  const seed = kind === "daily" || kind === "xi" ? today : null; // everyone gets the same daily quiz and XI
  let qs = await questionsFor(kind, { difficulty, seed });
  if (qs.length === 0) throw new GameError("Couldn't build this game right now. Try again in a minute.", 503);
  if (kind === "clubs" || kind === "shirt") qs = qs.map((q) => ({ ...q })); // fresh copies

  const id = newId(12);
  const session = {
    uid: identity.uid,
    kind,
    difficulty,
    qs,
    seconds: spec.seconds,
    idx: 0,
    issuedAt: Date.now(),
    score: 0,
    correct: 0,
    results: [],
    status: "active",
    createdAt: Date.now(),
    day: today,
  };
  await store.set(`sessions/${id}`, session);
  remember(id, session);
  return { session: id, kind, title: spec.title, question: publicQuestion(session, 0) };
}

export async function currentQuestion(identity, id) {
  const store = await getStore();
  const s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid) throw new GameError("That game wasn't found.", 404);
  if (s.status !== "active") return { done: true };
  return { session: id, kind: s.kind, title: KINDS[s.kind].title, question: publicQuestion(s, s.idx), score: s.score };
}

// The newest copy of a session this server instance wrote. It saves one slow database read per
// answer; it is only trusted when it is exactly at the question being answered, otherwise we read.
const recent = new Map();
export const _recentSessions = recent; // exposed for tests only
const remember = (id, s) => {
  recent.set(id, s);
  if (recent.size > 300) recent.delete(recent.keys().next().value);
};

export async function answerQuestion(identity, id, { index, choice }) {
  const store = await getStore();
  const cached = recent.get(id);
  const s = cached && cached.idx === index && cached.status === "active" ? structuredClone(cached) : await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid) throw new GameError("That game wasn't found.", 404);
  if (s.status !== "active") throw new GameError("This game is already finished.");
  if (index !== s.idx) throw new GameError("That question was already answered.");

  const q = s.qs[s.idx];
  const elapsed = Date.now() - s.issuedAt;
  const limit = s.seconds * 1000;
  const inTime = elapsed <= limit + GRACE_MS;
  const picked = Number.isInteger(choice) ? choice : -1;
  const ok = inTime && picked === q.answer;
  const base = BASE_POINTS[q.difficulty] ?? 100;
  const remaining = Math.max(0, 1 - Math.min(elapsed, limit) / limit);
  const points = ok ? base + Math.round(base * 0.5 * remaining) : 0;
  s.score += points;
  if (ok) s.correct += 1;
  s.results.push({ id: q.id, choice: picked, ok, points, ms: Math.min(elapsed, limit + GRACE_MS) });

  const answered = { correct: ok, answer: q.answer, points, timedOut: !inTime };
  s.idx += 1;
  if (s.idx < s.qs.length) {
    s.issuedAt = Date.now();
    await store.set(`sessions/${id}`, s);
    remember(id, s);
    return { ...answered, score: s.score, next: publicQuestion(s, s.idx) };
  }

  s.status = "done";
  recent.delete(id);
  // Saving the finished session and paying out the rewards are independent: do them together.
  const [, summary] = await Promise.all([store.set(`sessions/${id}`, s), finish(identity, s)]);
  return { ...answered, score: s.score, done: summary };
}

async function finish(identity, s) {
  const store = await getStore();
  const total = s.qs.length;
  const perfect = s.correct === total;
  const isDaily = s.kind === "daily";
  let xp = Math.round(s.score / 10);
  if (isDaily) xp = Math.round(xp * 1.5);
  let coins = s.correct + (perfect ? 5 : 0);

  // Replays are fine, but XP and coins thin out after 12 games a day so nobody can farm them.
  // (Both reads go out together: every round-trip to the database costs time.)
  const [row, profile] = await Promise.all([store.get(`daily_${s.day}/${identity.uid}`), getProfile(identity)]);
  const plays = row?.plays ?? 0;
  if (plays >= 12) {
    xp = Math.round(xp * 0.2);
    coins = Math.round(coins * 0.2);
  }

  const stats = { quizzes: 1, quizCorrect: s.correct };
  if (perfect) stats.perfectQuizzes = 1;
  if (isDaily) stats.dailyDone = 1;
  // The database is far away, so the writes go out together instead of one after another.
  const [reward] = await Promise.all([
    award(identity, { xp, coins, stats, profile }),
    store.set(`daily_${s.day}/${identity.uid}`, { plays: plays + 1, ...(isDaily ? { quiz: s.score, at: Date.now() } : {}) }, { merge: true }),
  ]);
  if (isDaily) await addBoardPoints("daily", identity, reward.profile, s.score);
  return { kind: s.kind, score: s.score, correct: s.correct, total, perfect, reward, results: s.results.map((r, i) => ({ ...r, answer: s.qs[i].answer, text: s.qs[i].text, options: s.qs[i].options })) };
}

export async function dailyStatus(identity) {
  const store = await getStore();
  const today = dayKey();
  const row = await store.get(`daily_${today}/${identity.uid}`);
  return {
    day: today,
    quizDone: row?.quiz != null,
    quizScore: row?.quiz ?? null,
    guessDone: row?.guess != null,
    guessScore: row?.guess ?? null,
    footleDone: row?.footle != null,
    footleScore: row?.footle ?? null,
    gridDone: row?.grid != null,
    gridScore: row?.grid ?? null,
  };
}

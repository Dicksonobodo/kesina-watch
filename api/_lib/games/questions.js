import { cached } from "../sports.js";
import { getLeaders } from "../football.js";
import { getStandings } from "../standings.js";
import { LEAGUES } from "../sports.js";
import { CURATED } from "./curated.js";
import { getStore } from "./store.js";
import { award } from "./profile.js";
import { GameError, newId, plain, rateLimit, rngFrom, sample, shuffle } from "./util.js";

/*
 * Where quiz questions come from:
 *  1. a hand-checked bank (curated.js),
 *  2. questions players wrote that an admin approved (Firestore "questions"),
 *  3. Open Trivia DB's sports questions that are about football (free, CC BY-SA),
 *  4. questions generated from live data (who leads a table, who is top scorer, which club a player is at).
 * Every question: { id, text, options[4], answer (index), category, difficulty, source }.
 */

const DIFFICULTIES = ["easy", "medium", "hard"];

export function shuffleQuestion(q, rng = Math.random) {
  const order = shuffle(q.options.map((_, i) => i), rng);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

/* ---------- Open Trivia DB ---------- */

const FOOTBALL_WORDS = /\b(football|soccer|fifa|uefa|premier league|world cup|la liga|serie a|bundesliga|champions league|ballon d'or|striker|goalkeeper|referee|penalty)\b/i;

async function loadOpenTdb() {
  const res = await fetch("https://opentdb.com/api.php?amount=50&category=21&type=multiple&encode=url3986", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`opentdb ${res.status}`);
  const body = await res.json();
  if (body.response_code !== 0) throw new Error(`opentdb code ${body.response_code}`);
  const dec = (s) => decodeURIComponent(s);
  return body.results
    .map((r) => ({ text: dec(r.question), correct: dec(r.correct_answer), wrong: r.incorrect_answers.map(dec), difficulty: r.difficulty }))
    .filter((r) => FOOTBALL_WORDS.test(`${r.text} ${r.correct}`) && r.wrong.length === 3)
    .map((r) => ({
      id: `o${[...plain(r.text)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36)}`,
      text: r.text,
      options: [r.correct, ...r.wrong],
      answer: 0,
      category: "trivia",
      difficulty: DIFFICULTIES.includes(r.difficulty) ? r.difficulty : "medium",
      source: "opentdb",
    }));
}

const openTdbQuestions = () => cached("games:opentdb", 6 * 3600_000, async () => ({ value: await loadOpenTdb() })).catch(() => []);

/* ---------- generated from live data ---------- */

const GENERATED_LEAGUES = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];

async function generate() {
  const out = [];
  const rng = rngFrom(new Date().toISOString().slice(0, 13)); // changes hourly
  for (const id of GENERATED_LEAGUES) {
    const league = LEAGUES.find((l) => l.id === id);
    const [leaders, table] = await Promise.all([getLeaders(id).catch(() => null), getStandings(id).catch(() => null)]);
    const rows = table?.groups?.[0]?.rows ?? [];
    if (rows.length >= 6 && Number(rows[0].values[0]) >= 3) {
      const top = rows[0];
      const others = sample(rows.slice(1, 8), 3, rng).map((r) => r.team);
      out.push({ text: `Which club is top of the ${league.name} table right now?`, options: [top.team, ...others], answer: 0, category: "live-data", difficulty: "easy", source: "generated", volatile: true });
    }
    const scorers = leaders?.scorers ?? [];
    if (scorers.length >= 4 && scorers[0].value > scorers[1].value) {
      out.push({
        text: `Who is the ${league.name}'s top scorer this season so far?`,
        options: scorers.slice(0, 4).map((s) => s.name),
        answer: 0,
        category: "live-data",
        difficulty: "medium",
        source: "generated",
        volatile: true,
      });
    }
    const teams = [...new Set(rows.map((r) => r.team))];
    for (const s of sample(scorers.slice(0, 25), 3, rng)) {
      const wrong = sample(teams.filter((t) => t !== s.team), 3, rng);
      if (wrong.length === 3) out.push({ text: `Which club does ${s.name} play for?`, options: [s.team, ...wrong], answer: 0, category: "live-data", difficulty: "easy", source: "generated", volatile: true });
    }
  }
  return out.map((q) => ({ ...q, id: `g${[...plain(q.text + q.options[0])].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 11).toString(36)}` }));
}

const generatedQuestions = () => cached("games:generated", 60 * 60_000, async () => ({ value: await generate() })).catch(() => []);

/* ---------- players' questions ---------- */

let userCache = { at: 0, rows: [] };

async function approvedUserQuestions() {
  if (Date.now() - userCache.at < 60_000) return userCache.rows;
  const store = await getStore();
  const rows = await store.list("questions", { where: [["status", "==", "approved"]], limit: 300 }).catch(() => []);
  userCache = {
    at: Date.now(),
    rows: rows.map((r) => ({ id: `u${r.id}`, text: r.text, options: r.options, answer: r.answer, category: r.category ?? "community", difficulty: r.difficulty ?? "medium", source: "community", by: r.byName })),
  };
  return userCache.rows;
}

/* ---------- building a quiz ---------- */

const MIX = {
  easy: { easy: 0.7, medium: 0.3, hard: 0 },
  medium: { easy: 0.2, medium: 0.6, hard: 0.2 },
  hard: { easy: 0, medium: 0.3, hard: 0.7 },
  mixed: { easy: 0.4, medium: 0.4, hard: 0.2 },
};

/** Picks `count` questions: the requested difficulty mix first, then anything to fill. Same seed = same quiz. */
export async function buildQuiz({ difficulty = "mixed", count = 10, seed = null, pool = null, excludeVolatile = false }) {
  const rng = seed ? rngFrom(seed) : Math.random;
  let all = pool;
  if (!all) {
    const [community, trivia, generated] = await Promise.all([approvedUserQuestions(), openTdbQuestions(), seed ? [] : generatedQuestions()]);
    all = [...CURATED, ...community, ...trivia, ...generated];
  }
  if (excludeVolatile) all = all.filter((q) => !q.volatile);
  const mix = MIX[difficulty] ?? MIX.mixed;
  const chosen = [];
  const used = new Set();
  for (const level of DIFFICULTIES) {
    const want = Math.round(count * (mix[level] ?? 0));
    for (const q of sample(all.filter((x) => x.difficulty === level), want, rng)) {
      chosen.push(q);
      used.add(q.id);
    }
  }
  for (const q of shuffle(all.filter((x) => !used.has(x.id)), rng)) {
    if (chosen.length >= count) break;
    chosen.push(q);
  }
  return shuffle(chosen, rng).slice(0, count).map((q) => shuffleQuestion(q, rng));
}

/* ---------- players write questions ---------- */

const CATEGORIES = ["world-cup", "continental", "clubs", "premier-league", "players", "national-teams", "rules", "trophy", "community"];

export async function submitQuestion(identity, body) {
  rateLimit(`submit:${identity.uid}`, 5, 24 * 3600_000);
  const text = String(body.text ?? "").trim();
  const options = (Array.isArray(body.options) ? body.options : []).map((o) => String(o ?? "").trim());
  const answer = Number(body.answer);
  if (text.length < 15 || text.length > 200 || !text.endsWith("?")) throw new GameError("Write the question in 15–200 characters, ending with a question mark.");
  if (options.length !== 4 || options.some((o) => !o || o.length > 60)) throw new GameError("Give exactly 4 answers, each up to 60 characters.");
  if (new Set(options.map(plain)).size !== 4) throw new GameError("The four answers must all be different.");
  if (![0, 1, 2, 3].includes(answer)) throw new GameError("Mark which answer is correct.");
  if ([text, ...options].some((t) => /https?:\/\/|www\./i.test(t))) throw new GameError("Please don't put links in the question or answers.");
  const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : "medium";
  const category = CATEGORIES.includes(body.category) ? body.category : "community";
  const source = String(body.source ?? "").trim().slice(0, 200);

  const store = await getStore();
  const id = newId();
  await store.set(`questions/${id}`, { text, options, answer, difficulty, category, source, status: "pending", by: identity.uid, byName: identity.name, reports: 0, createdAt: Date.now() });
  return { id, status: "pending" };
}

export async function pendingQuestions() {
  const store = await getStore();
  const rows = await store.list("questions", { where: [["status", "==", "pending"]], limit: 100 });
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function decideQuestion(id, approve) {
  const store = await getStore();
  const q = await store.get(`questions/${id}`);
  if (!q) throw new GameError("Question not found.", 404);
  await store.update(`questions/${id}`, { status: approve ? "approved" : "rejected", decidedAt: Date.now() });
  userCache.at = 0;
  if (approve && q.by) await award({ uid: q.by, name: q.byName }, { xp: 30, coins: 20, game: false, stats: { questionsApproved: 1 } });
  return { id, status: approve ? "approved" : "rejected" };
}

/** Players can flag a bad question; three flags hide it until an admin looks. */
export async function reportQuestion(identity, qid) {
  rateLimit(`report:${identity.uid}`, 20);
  if (!qid.startsWith("u")) return { ok: true }; // only community questions can be hidden here
  const id = qid.slice(1);
  const store = await getStore();
  const q = await store.get(`questions/${id}`);
  if (!q) return { ok: true };
  const reporters = new Set([...(q.reporters ?? []), identity.uid]);
  await store.update(`questions/${id}`, { reporters: [...reporters], reports: reporters.size, ...(reporters.size >= 3 && q.status === "approved" ? { status: "hidden" } : {}) });
  userCache.at = 0;
  return { ok: true };
}

export { CATEGORIES };

import { readFileSync } from "node:fs";
import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { setBoardScore } from "./leaderboard.js";
import { dayKey, GameError, plain, rateLimit, rngFrom, sample, shuffle } from "./util.js";

/*
 * Two games built on the club snapshot in bothclubs.json (who played for which of 16 big clubs):
 *  - Career path: the clubs a player has worn are revealed one by one (used by guess.js).
 *  - Club grid: a new 3x3 grid each day. Name a player who played for both the row's and the
 *    column's club in every square.
 */

// Career club names (careers.json) → the 16 grid clubs, so the two snapshots can back each other up.
const CLUB_ALIASES = {
  barcelona: "Q7156", "real madrid": "Q8682", "paris saint germain": "Q483020", "manchester united": "Q18656", "manchester city": "Q50602",
  chelsea: "Q9616", arsenal: "Q9617", liverpool: "Q1130849", juventus: "Q1422", milan: "Q1543", "ac milan": "Q1543", "inter milan": "Q631",
  internazionale: "Q631", "bayern munich": "Q15789", "borussia dortmund": "Q41420", "atletico madrid": "Q8701", "tottenham hotspur": "Q18741", ajax: "Q81888",
};

let data;
const load = () => {
  if (!data) {
    const raw = JSON.parse(readFileSync(new URL("./bothclubs.json", import.meta.url), "utf8"));
    // One entry per name. Different players can share a name (there are two famous Luis Suárezs):
    // their clubs are combined, so an answer is accepted if either of them fits.
    const byName = new Map();
    const add = (name, clubIds, sl) => {
      const key = plain(name);
      const cur = byName.get(key) ?? { name, sl, clubs: [] };
      cur.clubs = [...new Set([...cur.clubs, ...clubIds])];
      cur.sl = Math.max(cur.sl ?? 0, sl ?? 0);
      byName.set(key, cur);
    };
    for (const p of raw.players) add(p.name, p.clubs, p.sl);
    for (const p of careers()) add(p.name, p.path.map((x) => CLUB_ALIASES[plain(x.c)]).filter(Boolean), p.sl);
    data = { clubs: raw.clubs, players: raw.players, byName };
  }
  return data;
};

/** Names that can be typed in the guessing boxes. Obscure ones are left out of the suggestions only. */
export const clubPlayerNames = () => {
  const { players } = load();
  return players
    .filter((p) => p.sl >= 30)
    .sort((a, b) => b.sl - a.sl)
    .map((p) => p.name);
};

/* ---------- career path ---------- */

let careerData;
const careers = () => (careerData ??= JSON.parse(readFileSync(new URL("./careers.json", import.meta.url), "utf8")));

/** Every name that can be typed: the career players and the wider club snapshot. */
export const careerNames = () => [...new Set([...careers().map((p) => p.name), ...clubPlayerNames()])];

/**
 * A famous player's whole career path (every club in order, with the year he joined) as the first
 * clue, then optional hints that cost points: where he is from, where he played, when he was born,
 * and his initials. Wikidata snapshot in careers.json.
 */
export function careerClues(rng = Math.random) {
  const p = sample(careers(), 1, rng)[0];
  if (!p) return null;
  const parts = p.name.split(" ");
  const clues = [{ label: "Career path", text: "", path: p.path }];
  if (p.nat) clues.push({ label: "Country", text: p.nat });
  if (p.pos) clues.push({ label: "Position", text: p.pos });
  if (p.born) clues.push({ label: "Born", text: String(p.born) });
  clues.push({ label: "His name", text: `${parts.length} word${parts.length === 1 ? "" : "s"} · ${p.name.replace(/\s/g, "").length} letters` });
  clues.push({ label: "Starts with", text: `${p.name[0]}…  (surname ${parts.at(-1)[0]}…)` });
  return { name: p.name, team: p.path.at(-1).c, nationality: p.nat ?? "", position: p.pos ?? "", photo: null, clues };
}

/** Career path as quick-fire questions: the whole path is shown, pick the player from four. */
export function careerQuestions(count, rng = Math.random) {
  const pool = careers().filter((p) => p.path.length >= 3);
  const picks = sample(pool, count, rng);
  return picks.map((p) => {
    // wrong answers: other famous players from around the same time
    const near = pool.filter((x) => x.name !== p.name && Math.abs((x.born ?? 1990) - (p.born ?? 1990)) <= 6);
    const wrong = sample(near.length >= 3 ? near : pool.filter((x) => x.name !== p.name), 3, rng).map((x) => x.name);
    return {
      id: `cp${plain(p.name).replace(/ /g, "")}`,
      text: "Whose career is this?",
      options: [p.name, ...wrong],
      answer: 0,
      category: "career-path",
      difficulty: p.sl >= 120 ? "easy" : p.sl >= 80 ? "medium" : "hard",
      source: "wikidata",
      meta: { kind: "career", path: p.path },
    };
  });
}

/* ---------- club grid ---------- */

const ROWS = 3;
const GUESSES = 12;

const rarity = (sl) => (sl < 45 ? 100 : sl < 70 ? 70 : sl < 110 ? 40 : 20);

function buildGrid(day) {
  const { clubs, players } = load();
  const ids = Object.keys(clubs);
  const pool = players.filter((p) => p.sl >= 30);
  const rng = rngFrom(`grid-${day}`);
  for (let attempt = 0; attempt < 500; attempt++) {
    const six = shuffle(ids, rng).slice(0, 6);
    const rows = six.slice(0, ROWS);
    const cols = six.slice(ROWS);
    const ok = rows.every((r) => cols.every((c) => pool.filter((p) => p.clubs.includes(r) && p.clubs.includes(c)).length >= 3));
    if (ok) return { rows, cols };
  }
  throw new Error("no grid");
}

/**
 * Today's grid. It is saved the first time it is made, so later changes to the player data can
 * never change a grid that people have already started.
 */
async function gridFor(day) {
  const store = await getStore();
  const saved = await store.get(`grid_days/${day}`).catch(() => null);
  if (saved?.rows?.length === ROWS && saved?.cols?.length === ROWS) return saved;
  const grid = buildGrid(day);
  await store.set(`grid_days/${day}`, grid).catch(() => {});
  return grid;
}

const cellKey = (r, c) => `${r},${c}`;
const clubView = (id) => ({ id, name: load().clubs[id] });

async function gridView(day, state) {
  const { rows, cols } = await gridFor(day);
  const cells = Object.fromEntries(Object.entries(state.cells ?? {}).map(([k, v]) => [k, { name: v.name, points: v.points }]));
  return {
    day,
    rows: rows.map(clubView),
    cols: cols.map(clubView),
    cells,
    guessesLeft: GUESSES - (Object.keys(state.cells ?? {}).length + (state.wrong ?? 0)),
    wrong: state.wrong ?? 0,
    done: Boolean(state.done),
    score: state.score ?? 0,
    perfect: Boolean(state.perfect),
  };
}

export async function getGrid(identity) {
  const day = dayKey();
  const store = await getStore();
  return gridView(day, (await store.get(`grid_${day}/${identity.uid}`)) ?? {});
}

export async function guessGrid(identity, cell, name) {
  rateLimit(`grid:${identity.uid}`, 60);
  const day = dayKey();
  const store = await getStore();
  const path = `grid_${day}/${identity.uid}`;
  const state = (await store.get(path)) ?? {};
  if (state.done) throw new GameError("Today's grid is finished. Come back tomorrow!");
  const m = /^([0-2]),([0-2])$/.exec(String(cell));
  if (!m) throw new GameError("Pick a square.");
  state.cells ??= {};
  if (state.cells[cell]) throw new GameError("That square is already filled.");
  const typed = plain(name);
  if (typed.length < 3) throw new GameError("Type a player's name.");
  const { rows, cols } = await gridFor(day);
  const { clubs, byName } = load();
  const p = byName.get(typed);
  if (!p) throw new GameError("I don't know that player. Pick a name from the suggestions.");
  if (Object.values(state.cells).some((c) => plain(c.name) === typed)) throw new GameError("You've already used that player.");

  const r = rows[Number(m[1])];
  const c = cols[Number(m[2])];
  const correct = p.clubs.includes(r) && p.clubs.includes(c);
  let result;
  if (correct) {
    state.cells[cell] = { name: p.name, points: rarity(p.sl) };
  } else {
    state.wrong = (state.wrong ?? 0) + 1;
    result = { wrong: true, message: `${p.name} didn't play for both ${clubs[r]} and ${clubs[c]}.` };
  }
  const filled = Object.keys(state.cells).length;
  const finished = filled === ROWS * 3 || filled + (state.wrong ?? 0) >= GUESSES;
  let reward = null;
  if (finished) {
    state.done = true;
    state.perfect = filled === ROWS * 3;
    state.score = Object.values(state.cells).reduce((n, v) => n + v.points, 0) + (state.perfect ? 100 : 0);
    const profile = await getProfile(identity);
    [reward] = await Promise.all([
      award(identity, { profile, xp: Math.round(state.score / 8) + 15 + (state.perfect ? 40 : 0), coins: Math.ceil(state.score / 30), stats: { gridDone: 1, ...(state.perfect ? { gridPerfect: 1 } : {}) } }),
      store.set(`daily_${day}/${identity.uid}`, { grid: state.score }, { merge: true }),
      setBoardScore("grid", identity, profile, state.score),
    ]);
  }
  await store.set(path, state);
  return { ...(result ?? { ok: true }), grid: await gridView(day, state), reward };
}

import { readFileSync } from "node:fs";
import { GameError } from "../util.js";

/*
 * Word Swipe: a 4x4 grid of letters, 80 seconds. Swipe through neighbouring letters (diagonals
 * count) to spell words of 3+ letters. Both players get the same grid; the higher score wins.
 * Words are checked here against a public-domain word list (ENABLE), so a score can't be made up.
 */

export const SECONDS = 80;
const GRACE_MS = 15_000;
const SIZE = 4;

let words; // sorted array
let wordSet;
function dictionary() {
  if (!words) {
    words = readFileSync(new URL("../words.txt", import.meta.url), "utf8").split("\n");
    wordSet = new Set(words);
  }
  return { words, wordSet };
}

/** Is there any word starting with this prefix? (binary search in the sorted list) */
function hasPrefix(prefix) {
  const { words: list } = dictionary();
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo < list.length && list[lo].startsWith(prefix);
}

// Letters weighted like the Boggle dice so boards are fair and playable.
const DICE = ["AAEEGN", "ELRTTY", "AOOTTW", "ABBJOO", "EHRTVW", "CIMOTU", "DISTTY", "EIOSST", "DELRVY", "ACHOPS", "HIMNQU", "EEINSU", "EEGHNW", "AFFKPS", "HLNNRZ", "DEILRX"];

const NEIGHBOURS = Array.from({ length: SIZE * SIZE }, (_, i) => {
  const r = Math.floor(i / SIZE);
  const c = i % SIZE;
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr;
    const cc = c + dc;
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) out.push(rr * SIZE + cc);
  }
  return out;
});

const letterOf = (cell) => (cell === "Q" ? "qu" : cell.toLowerCase());

/** Every word on a board (used to give the browser instant feedback without sending the words). */
export function solve(board) {
  const { wordSet: set } = dictionary();
  const found = new Set();
  const walk = (i, used, text) => {
    const next = text + letterOf(board[i]);
    if (!hasPrefix(next)) return;
    if (next.length >= 3 && set.has(next)) found.add(next);
    used.add(i);
    for (const n of NEIGHBOURS[i]) if (!used.has(n)) walk(n, used, next);
    used.delete(i);
  };
  for (let i = 0; i < SIZE * SIZE; i++) walk(i, new Set(), "");
  return found;
}

export function newBoard() {
  for (let attempt = 0; attempt < 40; attempt++) {
    const dice = [...DICE].sort(() => Math.random() - 0.5);
    const board = dice.map((d) => d[Math.floor(Math.random() * 6)]);
    const solved = solve(board);
    if (solved.size >= 90) return { board, total: solved.size };
  }
  const board = DICE.map((d) => d[Math.floor(Math.random() * 6)]);
  return { board, total: solve(board).size };
}

export const scoreWord = (w) => (w.length <= 3 ? 100 : w.length === 4 ? 400 : w.length === 5 ? 800 : w.length === 6 ? 1400 : w.length === 7 ? 1800 : 2200);

/** FNV-1a: the browser hashes what you swipe and checks it against the board's word hashes. */
export const hash = (w) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < w.length; i++) {
    h ^= w.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

export function create() {
  const { board, total } = newBoard();
  return { state: { board, total, runs: {} }, secret: {}, turn: null };
}

export function view(g, uid) {
  const run = g.state.runs[uid];
  const done = g.status === "done";
  const out = {
    seconds: SECONDS,
    total: g.state.total,
    started: Boolean(run),
    finished: Boolean(run?.done),
    startedAt: run?.startedAt ?? null,
    myScore: run?.done ? run.score : null,
    myWords: run?.done ? run.words : null,
  };
  // The grid is only shown once you start your run (or the game is over).
  if (run || done) {
    out.board = g.state.board;
    if (run && !run.done) out.hashes = [...solve(g.state.board)].map(hash);
  }
  if (done) out.results = Object.fromEntries(g.players.map((p) => [p, { score: g.state.runs[p]?.score ?? 0, words: g.state.runs[p]?.words ?? [] }]));
  return out;
}

export function move(g, uid, body) {
  const runs = g.state.runs;
  if (body.type === "begin") {
    if (runs[uid]) return {}; // already started
    runs[uid] = { startedAt: Date.now(), done: false, score: 0, words: [] };
    return { changed: true };
  }
  if (body.type === "submit") {
    const run = runs[uid];
    if (!run) throw new GameError("Start your round first.");
    if (run.done) throw new GameError("You already played this one.");
    const late = Date.now() - run.startedAt > (SECONDS * 1000 + GRACE_MS);
    const set = solve(g.state.board);
    const seen = new Set();
    let score = 0;
    const accepted = [];
    if (!late) {
      for (const raw of Array.isArray(body.words) ? body.words.slice(0, 400) : []) {
        const w = String(raw).toLowerCase();
        if (seen.has(w) || !set.has(w)) continue; // not a word, or not on this board
        seen.add(w);
        accepted.push(w);
        score += scoreWord(w);
      }
    }
    run.done = true;
    run.score = score;
    run.words = accepted.sort((a, b) => b.length - a.length || a.localeCompare(b));
    const all = g.players.every((p) => runs[p]?.done);
    if (!all) return { changed: true };
    const [a, b] = g.players;
    const winner = runs[a].score === runs[b].score ? "draw" : runs[a].score > runs[b].score ? a : b;
    return { changed: true, ended: true, winner };
  }
  throw new GameError("Unknown move.");
}

export const card = (g) => ({ scores: Object.fromEntries(g.players.filter((p) => g.state.runs[p]?.done).map((p) => [p, g.state.runs[p].score])), played: g.players.filter((p) => g.state.runs[p]?.done) });
export const title = "Word Swipe";

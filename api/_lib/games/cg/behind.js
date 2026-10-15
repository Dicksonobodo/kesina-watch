import { readFileSync } from "node:fs";
import { getPhoto } from "../../photos.js";
import { playerPool } from "../content.js";
import { GameError, plain } from "../util.js";

/*
 * Who's Behind You? (two players, in the chat). One person plays at a time:
 *
 *   1. Setup: whoever starts sets how many questions each guess gets and how many rounds.
 *   2. The picker chooses a real footballer for the other player (the guesser), who can't see it.
 *   3. The guesser asks yes/no questions, one at a time; the picker answers each one.
 *   4. When they think they know, the guesser sends their answer (types the name).
 *   5. The picker, who can see the player, approves it: Correct (a point) or Wrong (costs a question;
 *      with none left, the turn is over).
 *   6. Then they swap: the guesser becomes the picker. A round is one turn each.
 *
 * Most correct guesses wins; level on points, fewer questions used wins. The picked player stays on
 * the server until that turn is over.
 */

export const QUESTION_CHOICES = [5, 10, 15, 20];
export const ROUND_CHOICES = [1, 3, 5];
const ANSWERS = { yes: "Yes", no: "No", maybe: "Not sure" };

let known;
/**
 * Every footballer the site knows without asking anyone: the famous careers, everyone who played
 * for the big clubs (the Club Grid list) and the shootout's stars. Always there, even on a server
 * that has only just started.
 */
function knownPlayers() {
  if (!known) {
    const read = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), "utf8"));
    const careers = read("careers.json");
    const both = read("bothclubs.json");
    const stars = read("shootout_players.json");
    const seen = new Set();
    known = [];
    const add = (name, team) => {
      const key = plain(name);
      if (!name || /^Q\d+$/.test(name) || seen.has(key)) return;
      seen.add(key);
      known.push({ id: `c:${key.replace(/ /g, "-")}`, name, team: team ?? "" });
    };
    for (const p of [...stars.shooters, ...stars.keepers]) add(p.name, p.team === "Legend" ? "" : p.team);
    for (const p of careers) add(p.name, p.path.at(-1)?.c);
    for (const p of [...both.players].sort((x, y) => (y.sl ?? 0) - (x.sl ?? 0))) add(p.name, both.clubs[p.clubs.at(-1)]);
  }
  return known;
}

/** Everyone who can be picked: this season's players (when the league data is reachable) and everyone above. */
export async function behindPlayers() {
  // This season's players come from the league tables, which can take a few seconds to build on a
  // cold server; don't keep anyone waiting for them.
  const pool = await Promise.race([playerPool().catch(() => []), new Promise((r) => setTimeout(() => r([]), 4000))]);
  const current = pool.map((p) => ({ id: p.id, name: p.name, team: p.team }));
  const seen = new Set(current.map((p) => plain(p.name)));
  const all = [...current, ...knownPlayers().filter((p) => !seen.has(plain(p.name)))];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The player that was picked. Anyone from the list is accepted even if this server hasn't got this
 * season's players yet (it uses the name and club the picker's screen sent), and a name typed by
 * hand ("free:") is accepted as it is.
 */
async function lookup(id, body) {
  const key = String(id ?? "");
  const found = knownPlayers().find((x) => x.id === key) ?? (key.startsWith("c:") || key.startsWith("free:") ? null : (await behindPlayers()).find((x) => x.id === key));
  if (found) return found;
  const name = clean(body.name, 60);
  if (name.length < 2) throw new GameError("Pick a player, or type their name.");
  return { id: key || `free:${plain(name)}`, name, team: clean(body.team, 60) };
}

const cardOf = (p) => (p ? { name: p.name, team: p.team, photo: p.photo ?? null } : null);
const clean = (text, max) => String(text ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);

export function create(players) {
  const [starter] = players;
  return {
    state: {
      phase: "setup", // setup → pick → ask ⇄ answer / judge → (next turn) pick …
      questions: 10,
      rounds: 3,
      round: 1,
      turnNo: 1, // two turns per round: each player guesses once
      picker: starter,
      guesser: players[1],
      used: 0, // questions used in this turn
      log: [],
      pending: null, // the question or answer waiting for the picker
      score: Object.fromEntries(players.map((p) => [p, 0])),
      usedTotal: Object.fromEntries(players.map((p) => [p, 0])),
      turns: [], // finished turns: who guessed, who it was, right or not
    },
    secret: { card: null },
    turn: starter,
  };
}

export function view(g, uid) {
  const s = g.state;
  const iAmPicker = s.picker === uid;
  return {
    phase: s.phase,
    questions: s.questions,
    rounds: s.rounds,
    round: s.round,
    turnNo: s.turnNo,
    picker: s.picker,
    guesser: s.guesser,
    role: iAmPicker ? "picker" : "guesser",
    // only the picker sees the player while the turn is on
    card: iAmPicker ? cardOf(g.secret.card) : null,
    questionsLeft: s.questions - s.used,
    used: s.used,
    pending: s.pending,
    log: s.log,
    score: s.score,
    usedTotal: s.usedTotal,
    turns: s.turns,
    choices: { questions: QUESTION_CHOICES, rounds: ROUND_CHOICES },
  };
}

/** The turn is over: reveal the player, then swap roles (or finish the game). */
function endTurn(g, correct) {
  const s = g.state;
  if (correct) s.score[s.guesser] += 1;
  s.usedTotal[s.guesser] += s.used;
  s.turns.push({ round: s.round, guesser: s.guesser, picker: s.picker, card: cardOf(g.secret.card), correct, used: s.used });
  const lastTurnOfGame = s.round >= s.rounds && s.turnNo % 2 === 0;
  if (lastTurnOfGame) {
    s.phase = "over";
    s.pending = null;
    const [a, b] = g.players;
    let winner = "draw";
    if (s.score[a] !== s.score[b]) winner = s.score[a] > s.score[b] ? a : b;
    else if (s.usedTotal[a] !== s.usedTotal[b]) winner = s.usedTotal[a] < s.usedTotal[b] ? a : b; // fewer questions used
    return { ended: true, winner, handoff: true };
  }
  // swap: the guesser now picks for the other player
  const nextPicker = s.guesser;
  s.guesser = s.picker;
  s.picker = nextPicker;
  if (s.turnNo % 2 === 0) s.round += 1;
  s.turnNo += 1;
  s.phase = "pick";
  s.used = 0;
  s.log = [];
  s.pending = null;
  g.secret.card = null;
  g.turn = s.picker;
  return { handoff: true };
}

export async function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  const s = g.state;

  switch (body.do) {
    case "setup": {
      if (s.phase !== "setup") throw new GameError("The game is already set up.");
      const q = Number(body.questions);
      const r = Number(body.rounds);
      if (!QUESTION_CHOICES.includes(q)) throw new GameError("Choose how many questions.");
      if (!ROUND_CHOICES.includes(r)) throw new GameError("Choose how many rounds.");
      s.questions = q;
      s.rounds = r;
      s.phase = "pick";
      return { changed: true }; // the starter picks straight away
    }

    case "pick": {
      if (s.phase !== "pick" || uid !== s.picker) throw new GameError("It isn't time to pick.");
      const p = await lookup(body.player, body);
      // The club has to agree for a photo to count; if it doesn't (an old club, a typed name), try the name alone.
      const photo = (await getPhoto(p.name, p.team).catch(() => null)) ?? (p.team ? await getPhoto(p.name, "").catch(() => null) : null);
      g.secret.card = { ...p, photo };
      s.phase = "ask";
      g.turn = s.guesser;
      return { changed: true };
    }

    case "ask": {
      if (s.phase !== "ask" || uid !== s.guesser) throw new GameError("It isn't your turn to ask.");
      if (s.used >= s.questions) throw new GameError("No questions left. Send your answer.");
      const text = clean(body.text, 140);
      if (text.length < 3) throw new GameError("Type a yes or no question.");
      s.used += 1;
      const id = `q${s.turnNo}-${s.log.length + 1}`;
      s.log.push({ id, type: "q", text, answer: null });
      s.pending = { id, type: "q", text };
      s.phase = "answer";
      g.turn = s.picker;
      return { changed: true };
    }

    case "answer": {
      if (s.phase !== "answer" || uid !== s.picker) throw new GameError("There's no question to answer.");
      const answer = ANSWERS[body.answer];
      if (!answer) throw new GameError("Answer yes, no or not sure.");
      const q = s.log.find((x) => x.id === s.pending?.id);
      if (q) q.answer = answer;
      s.pending = null;
      s.phase = "ask";
      g.turn = s.guesser;
      return { changed: true };
    }

    case "guess": {
      if (s.phase !== "ask" || uid !== s.guesser) throw new GameError("It isn't your turn.");
      const text = clean(body.text, 60);
      if (text.length < 2) throw new GameError("Type the player's name.");
      const id = `g${s.turnNo}-${s.log.length + 1}`;
      s.log.push({ id, type: "guess", text, verdict: null });
      s.pending = { id, type: "guess", text };
      s.phase = "judge";
      g.turn = s.picker;
      return { changed: true };
    }

    case "judge": {
      if (s.phase !== "judge" || uid !== s.picker) throw new GameError("There's no answer to approve.");
      const correct = body.correct === true;
      const entry = s.log.find((x) => x.id === s.pending?.id);
      if (entry) entry.verdict = correct ? "correct" : "wrong";
      s.pending = null;
      if (correct) return { changed: true, ...endTurn(g, true) };
      s.used = Math.min(s.questions, s.used + 1); // a wrong answer costs a question
      if (s.used >= s.questions) return { changed: true, ...endTurn(g, false) };
      s.phase = "ask";
      g.turn = s.guesser;
      return { changed: true };
    }

    case "giveup": {
      if (s.phase !== "ask" || uid !== s.guesser) throw new GameError("It isn't your turn.");
      s.used = s.questions;
      return { changed: true, ...endTurn(g, false) };
    }

    default:
      throw new GameError("Unknown move.");
  }
}

export const card = (g) => ({ score: g.state.score, round: g.state.round, rounds: g.state.rounds, phase: g.state.phase });
export const title = "Who's Behind You?";

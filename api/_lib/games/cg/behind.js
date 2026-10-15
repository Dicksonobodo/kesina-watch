import { readFileSync } from "node:fs";
import { getPhoto } from "../../photos.js";
import { playerPool } from "../content.js";
import { GameError, plain } from "../util.js";

/*
 * Who's Behind You? (two players, in the chat). Each round both players secretly pick a real
 * footballer for the other one. You can see the player you picked for them, never your own. Take
 * turns: answer their last yes/no question, then ask one about your own player, or guess who it is.
 * First to guess their own player wins the round; three rounds, the pickers take turns going first.
 *
 * The player each person has to guess stays on the server until the round is over.
 */

export const ROUNDS = 3;
const MAX_QUESTIONS = 15; // each, per round
const ANSWERS = { yes: "Yes", no: "No", maybe: "Not sure" };

let legends;
function famous() {
  if (!legends) {
    const list = JSON.parse(readFileSync(new URL("../careers.json", import.meta.url), "utf8"));
    legends = list.slice(0, 320).map((p) => ({ id: `c:${plain(p.name).replace(/ /g, "-")}`, name: p.name, team: p.path.at(-1)?.c ?? "" }));
  }
  return legends;
}

/** Everyone who can be picked: today's top players and famous names from football history. */
export async function behindPlayers() {
  // Today's players come from the league tables, which can take a few seconds to build on a cold
  // server; don't keep anyone waiting for them: the famous names are always there straight away.
  const pool = await Promise.race([playerPool().catch(() => []), new Promise((r) => setTimeout(() => r([]), 4000))]);
  const current = pool.map((p) => ({ id: p.id, name: p.name, team: p.team }));
  const seen = new Set(current.map((p) => plain(p.name)));
  const all = [...current, ...famous().filter((p) => !seen.has(plain(p.name)))];
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

async function lookup(id) {
  const all = await behindPlayers();
  const p = all.find((x) => x.id === String(id));
  if (!p) throw new GameError("Pick a player from the list.");
  return p;
}

const other = (g, uid) => g.players.find((p) => p !== uid);

function freshRound(g, round) {
  // the pickers take turns going first: the starter in rounds 1 and 3, the other player in round 2
  const first = round % 2 === 1 ? g.players[0] : g.players[1];
  g.state.round = round;
  g.state.phase = "pick";
  g.state.log = [];
  g.state.pending = null;
  g.state.asked = Object.fromEntries(g.players.map((p) => [p, 0]));
  g.secret.assigned = {};
  g.turn = first;
}

export function create(players) {
  const g = { players, state: { score: Object.fromEntries(players.map((p) => [p, 0])), history: [] }, secret: {}, turn: null };
  freshRound(g, 1);
  return { state: g.state, secret: g.secret, turn: g.turn };
}

const cardOf = (p) => (p ? { name: p.name, team: p.team, photo: p.photo ?? null } : null);

export function view(g, uid) {
  const s = g.state;
  const opp = other(g, uid);
  const roundOver = s.phase === "between";
  return {
    round: s.round,
    rounds: ROUNDS,
    phase: s.phase, // pick | play | between
    score: s.score,
    // the player I answer questions about (I picked it, so I may see it)
    theirCard: cardOf(g.secret.assigned?.[opp]),
    // my own player: hidden until the round is over
    myCard: roundOver || g.status === "done" ? cardOf(g.secret.assigned?.[uid]) : null,
    iPicked: Boolean(g.secret.assigned?.[opp]),
    theyPicked: Boolean(g.secret.assigned?.[uid]),
    pending: s.pending && s.pending.to === uid ? s.pending : null, // a question waiting for my answer
    waitingFor: s.pending && s.pending.to !== uid ? s.pending : null, // my question, waiting for theirs
    log: s.log,
    questionsLeft: Object.fromEntries(g.players.map((p) => [p, MAX_QUESTIONS - (s.asked?.[p] ?? 0)])),
    history: s.history,
    lastRound: s.lastRound ?? null,
    maxQuestions: MAX_QUESTIONS,
  };
}

function endRound(g, winner, reason) {
  const s = g.state;
  if (winner) s.score[winner] += 1;
  s.lastRound = {
    round: s.round,
    winner,
    reason,
    cards: Object.fromEntries(g.players.map((p) => [p, cardOf(g.secret.assigned[p])])),
  };
  s.history.push({ round: s.round, winner });
  const [a, b] = g.players;
  const decided = s.score[a] > ROUNDS / 2 || s.score[b] > ROUNDS / 2;
  if (s.round >= ROUNDS || decided) {
    s.phase = "between";
    return { ended: true, handoff: true, winner: s.score[a] === s.score[b] ? "draw" : s.score[a] > s.score[b] ? a : b };
  }
  // the next round starts with picks; the cards from this one stay visible in lastRound
  freshRound(g, s.round + 1);
  return { handoff: true }; // the other player hears about the round in the chat
}

export async function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  const s = g.state;
  const opp = other(g, uid);

  if (body.do === "pick") {
    if (s.phase !== "pick") throw new GameError("Players are already picked for this round.");
    if (g.secret.assigned[opp]) throw new GameError("You already picked.");
    const p = await lookup(body.player);
    const photo = await getPhoto(p.name, p.team).catch(() => null);
    g.secret.assigned[opp] = { ...p, photo };
    s.log.push({ by: uid, type: "pick" });
    if (g.secret.assigned[uid]) {
      // both picked: the one who picked first asks first
      s.phase = "play";
      g.turn = s.round % 2 === 1 ? g.players[0] : g.players[1];
    } else g.turn = opp;
    return { changed: true };
  }

  if (s.phase !== "play") throw new GameError("Wait for both players to be picked.");

  if (body.do === "answer") {
    if (!s.pending || s.pending.to !== uid) throw new GameError("There's no question to answer.");
    const answer = ANSWERS[body.answer];
    if (!answer) throw new GameError("Answer yes, no or not sure.");
    const q = s.log.find((x) => x.id === s.pending.id);
    if (q) q.answer = answer;
    s.pending = null;
    return { changed: true }; // still your turn: now ask or guess
  }

  if (s.pending && s.pending.to === uid) throw new GameError("Answer their question first.");

  if (body.do === "ask") {
    const text = String(body.text ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 140);
    if (text.length < 3) throw new GameError("Type a yes or no question.");
    if (s.asked[uid] >= MAX_QUESTIONS) throw new GameError("You're out of questions this round. Make a guess.");
    s.asked[uid] += 1;
    const id = `q${s.round}-${s.log.length + 1}`;
    s.log.push({ id, by: uid, type: "q", text, answer: null });
    s.pending = { id, to: opp, text, by: uid };
    g.turn = opp;
    return { changed: true };
  }

  if (body.do === "guess") {
    const mine = g.secret.assigned[uid];
    const guess = await lookup(body.player);
    const correct = guess.id === mine.id || plain(guess.name) === plain(mine.name);
    s.log.push({ by: uid, type: "guess", text: guess.name, correct });
    if (correct) {
      const r = endRound(g, uid, "guessed");
      return { changed: true, ...r, correctGuess: true };
    }
    s.asked[uid] = Math.min(MAX_QUESTIONS, s.asked[uid] + 1); // a wrong guess costs a question
    // nobody can ask any more: the round is a draw
    if (g.players.every((p) => s.asked[p] >= MAX_QUESTIONS)) return { changed: true, ...endRound(g, null, "out of questions") };
    g.turn = opp;
    return { changed: true, wrongGuess: true };
  }

  if (body.do === "pass") {
    // out of questions and not ready to guess: hand over
    if (s.asked[uid] < MAX_QUESTIONS) throw new GameError("Ask a question or make a guess.");
    if (g.players.every((p) => s.asked[p] >= MAX_QUESTIONS)) return { changed: true, ...endRound(g, null, "out of questions") };
    g.turn = opp;
    return { changed: true };
  }

  throw new GameError("Unknown move.");
}

export const card = (g) => ({ score: g.state.score, round: g.state.round, phase: g.state.phase });
export const title = "Who's Behind You?";

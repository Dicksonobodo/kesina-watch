import { GameError } from "../util.js";

/*
 * Darts, 301. Three darts a turn; every dart takes its score off your total and you win by landing
 * exactly on zero (go below zero and the turn is a bust: your score goes back to where it started).
 *
 * You choose where to aim; the server decides where the dart really lands (a little wobble that
 * gets bigger on a wild aim), and works out the score from the landing spot. Positions are
 * measured from the centre of the board in units where the outer edge of the double ring is 1.
 */

const START = 301;
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]; // clockwise from the top

// Ring edges (real board: millimetres out of 170 to the outside of the double ring)
const BULL = 6.35 / 170;
const OUTER_BULL = 15.9 / 170;
const TREBLE = [99 / 170, 107 / 170];
const DOUBLE = [162 / 170, 1];

/** What a dart that lands at (x, y) scores. y is "up" (screen y grows downward, so the client flips it). */
export function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r < BULL) return { score: 50, label: "Bullseye", ring: "bull" };
  if (r < OUTER_BULL) return { score: 25, label: "25", ring: "outer" };
  if (r > DOUBLE[1]) return { score: 0, label: "Miss", ring: "miss" };
  const deg = ((Math.atan2(x, y) * 180) / Math.PI + 360 + 9) % 360; // 0 = straight up, clockwise
  const value = ORDER[Math.floor(deg / 18) % 20];
  if (r >= TREBLE[0] && r <= TREBLE[1]) return { score: value * 3, label: `T${value}`, ring: "treble" };
  if (r >= DOUBLE[0]) return { score: value * 2, label: `D${value}`, ring: "double" };
  return { score: value, label: String(value), ring: "single" };
}

const gaussian = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export function create(players) {
  const first = players[Math.floor(Math.random() * 2)];
  return {
    state: { left: Object.fromEntries(players.map((p) => [p, START])), turnStart: START, thrown: [], history: [], dartsLeft: 3, log: [{ by: null, text: `First to zero from ${START}. Three darts a turn.` }] },
    secret: {},
    turn: first,
  };
}

export function view(g) {
  const s = g.state;
  return { left: s.left, thrown: s.thrown, dartsLeft: s.dartsLeft, history: s.history.slice(-12), log: s.log.slice(-6), start: START };
}

export function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  if (body.do !== "throw") throw new GameError("Unknown move.");
  const s = g.state;
  const ax = Number(body.x);
  const ay = Number(body.y);
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) throw new GameError("Aim at the board.");
  const reach = Math.hypot(ax, ay);
  if (reach > 1.25) throw new GameError("Aim at the board.");

  // The wobble: small near the middle of the board, bigger when aiming for the edges.
  const spread = 0.022 + reach * 0.03;
  const x = ax + gaussian() * spread;
  const y = ay + gaussian() * spread;
  const hit = scoreAt(x, y);

  if (s.thrown.length === 0) s.turnStart = s.left[uid];
  const remaining = s.left[uid] - hit.score;
  const dart = { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, score: hit.score, label: hit.label, ring: hit.ring };
  s.thrown.push(dart);
  s.dartsLeft -= 1;

  let bust = false;
  let win = false;
  if (remaining < 0) {
    bust = true;
    s.left[uid] = s.turnStart;
  } else {
    s.left[uid] = remaining;
    win = remaining === 0;
  }

  if (win) {
    s.log.push({ by: uid, text: `checked out with ${hit.label}!` });
    s.history.push({ by: uid, darts: s.thrown.map((d) => d.label), left: 0 });
    return { changed: true, ended: true, winner: uid, dart };
  }
  if (bust || s.dartsLeft === 0) {
    s.history.push({ by: uid, darts: s.thrown.map((d) => d.label), left: s.left[uid], bust });
    s.log.push({ by: uid, text: bust ? `bust! back to ${s.left[uid]}` : `scored ${s.thrown.reduce((n, d) => n + d.score, 0)}, ${s.left[uid]} left` });
    s.thrown = [];
    s.dartsLeft = 3;
    g.turn = g.players.find((p) => p !== uid);
  }
  return { changed: true, dart, bust, turnOver: g.turn !== uid };
}

export const card = (g) => ({ left: g.state.left });
export const title = "Darts";

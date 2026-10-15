import { GameError } from "../util.js";

/*
 * Darts, 301. Three darts a turn; every dart takes its score off your total and you win by landing
 * exactly on zero (go below zero and the turn is a bust: your score goes back to where it started).
 *
 * There is no aiming cross-hair: you flick the dart. The flick's direction decides left and right,
 * its speed decides how high it lands (too soft drops short, too hard sails over), and a little
 * wobble is added here. Positions are measured from the centre of the board in units where the
 * outer edge of the double ring is 1.
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

/**
 * Where a flick sends the dart. flick = { x0, y0, dx, dy, ms }: the release point in board units,
 * and how far the finger moved (in board widths) over the last `ms` milliseconds before letting go.
 * Speed (board widths a second) sets the height: about 4.5 hits the middle, 2 the bottom edge,
 * 7 the top edge. The direction of the flick sets where it goes sideways.
 */
export function aimFromFlick(flick) {
  if (!flick || typeof flick !== "object") return null;
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : null);
  const x0 = num(flick.x0, -1.4, 1.4);
  const y0 = num(flick.y0, -2.6, 1.4);
  const dx = num(flick.dx, -3, 3);
  const dy = num(flick.dy, -3, 3);
  const ms = num(flick.ms, 16, 600);
  if ([x0, y0, dx, dy, ms].includes(null) || dy >= -0.02) return null; // it has to go up
  const speed = -dy / (ms / 1000);
  const y = Math.max(-2, Math.min(2, (speed - 4.5) * 0.4));
  const x = Math.max(-2, Math.min(2, x0 + (dx / -dy) * Math.max(0.2, y - y0)));
  return [x, y];
}

const gaussian = () => {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
};

export function create(players) {
  const first = players[0]; // whoever starts the game throws first
  return {
    state: { left: Object.fromEntries(players.map((p) => [p, START])), turnStart: START, thrown: [], history: [], dartsLeft: 3, log: [{ by: null, text: `First to zero from ${START}. Three darts a turn.` }] },
    secret: {},
    turn: first,
  };
}

export function view(g) {
  const s = g.state;
  return { left: s.left, thrown: s.thrown, dartsLeft: s.dartsLeft, history: s.history.slice(-12), visits: s.history.length, log: s.log.slice(-6), start: START };
}

export function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  if (body.do !== "throw") throw new GameError("Unknown move.");
  const s = g.state;
  const aim = aimFromFlick(body.flick);
  if (!aim) throw new GameError("Flick the dart up towards the board.");
  const [ax, ay] = aim;
  const reach = Math.min(1.25, Math.hypot(ax, ay));

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

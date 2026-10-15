/*
 * The penalty scene's camera and the players' poses. The camera stands behind the ball and a little
 * above it, looking at the goal (like Score Hero), so everything is placed in metres on the pitch and
 * projected: X across the pitch (left to right as the shooter looks), Y up, Z from the ball towards
 * the goal. Goal coordinates (what the server uses) are x -1..1 post to post and y 0..1 up to the bar.
 */

export const W = 360;
export const H = 440;
const F = 700; // focal length in view units
const CAM_H = 3.2;
const CAM_D = 9; // metres behind the ball
const CX = W / 2;
const HORIZON = 120;

export const GOAL = { half: 3.66, height: 2.44 };
export const BALL_R = 0.125;
export const goalLine = (yards) => yards * 0.9144;
export const DISTANCE_NAMES = { 12: "Penalty spot", 18: "Edge of the box", 25: "Long range" };

export function project(X, Y, Z) {
  const s = F / Math.max(0.6, Z + CAM_D);
  return { x: CX + X * s, y: HORIZON + (CAM_H - Y) * s, s };
}

/** Goal coordinates → a point on the goal line, in metres. */
export const goalPoint = (gx, gy, yards) => [gx * GOAL.half, gy * GOAL.height, goalLine(yards)];
export const scaleAtGoal = (yards) => F / (goalLine(yards) + CAM_D);

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clamp01 = (t) => clamp(t, 0, 1);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The aim drifts while you hold it (more from further out). The server adds its own small wobble
 * when the shot is taken (api/_lib/games/shootout.js), so a shot near a post is a real risk.
 */
const SWAY = { 12: [0.06, 0.045], 18: [0.15, 0.09], 25: [0.27, 0.14] };
export function sway(ms, yards, phase) {
  const [ax, ay] = SWAY[yards] ?? SWAY[12];
  const t = ms / 1000;
  return [ax * (Math.sin(t * 4.4 + phase) * 0.8 + Math.sin(t * 9.1 + phase * 2) * 0.25), ay * Math.sin(t * 6.1 + phase * 1.7)];
}

/* ---------- poses: joints in metres; [across, up, forward] relative to the player's spot ---------- */

const JOINTS = ["hipL", "hipR", "kneeL", "kneeR", "footL", "footR", "shL", "shR", "elL", "elR", "handL", "handR", "neck", "head"];

export function lerpPose(a, b, t) {
  const out = {};
  for (const k of JOINTS) out[k] = [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2] ?? 0, b[k][2] ?? 0, t)];
  return out;
}

// The shooter, seen from behind. "Plant" is the moment before the strike (frozen while you aim).
export const SHOOTER_SPOT = { start: [-1.55, -1.95], plant: [-0.38, -0.42] };
export const STAND = {
  hipL: [-0.1, 0.92, 0], hipR: [0.1, 0.92, 0], kneeL: [-0.11, 0.5, 0.03], kneeR: [0.11, 0.5, 0.03], footL: [-0.13, 0.04, 0], footR: [0.13, 0.04, 0],
  shL: [-0.21, 1.42, 0], shR: [0.21, 1.42, 0], elL: [-0.27, 1.16, 0], elR: [0.27, 1.16, 0], handL: [-0.29, 0.92, 0.03], handR: [0.29, 0.92, 0.03], neck: [0, 1.5, 0], head: [0, 1.63, 0],
};
const PLANT = {
  hipL: [-0.1, 0.88, 0.06], hipR: [0.1, 0.88, 0.04], kneeL: [0.06, 0.5, 0.3], kneeR: [0.14, 0.52, -0.08], footL: [0.12, 0.04, 0.36], footR: [0.13, 0.46, -0.44],
  shL: [-0.23, 1.38, 0.2], shR: [0.19, 1.38, 0.18], elL: [-0.46, 1.3, 0.22], elR: [0.31, 1.15, -0.02], handL: [-0.66, 1.2, 0.26], handR: [0.36, 0.96, -0.18], neck: [-0.01, 1.46, 0.22], head: [-0.01, 1.58, 0.27],
};
const CONTACT = { ...PLANT, kneeR: [0.26, 0.46, 0.22], footR: [0.36, 0.1, 0.36], elR: [0.33, 1.2, 0.05], handR: [0.42, 1.02, -0.05] };
const FOLLOW = {
  ...PLANT, hipL: [-0.1, 0.9, 0.1], hipR: [0.1, 0.92, 0.12], kneeR: [0.3, 0.78, 0.55], footR: [0.42, 0.8, 0.98], shL: [-0.22, 1.4, 0.1], shR: [0.2, 1.41, 0.12],
  elL: [-0.48, 1.36, 0.2], handL: [-0.72, 1.36, 0.3], elR: [0.36, 1.22, 0.2], handR: [0.48, 1.1, 0.24], neck: [0, 1.49, 0.13], head: [0, 1.61, 0.15],
};

/** The kick: 0 = leg drawn back, 0.45 = foot meets the ball, 1 = follow-through. */
export function kickPose(k) {
  if (k <= 0.45) return lerpPose(PLANT, CONTACT, k / 0.45);
  return lerpPose(CONTACT, FOLLOW, (k - 0.45) / 0.55);
}
export const plantPose = () => PLANT;

/** Running: phi is the stride (one full turn = two steps). */
export function runPose(phi, lean = 0.12) {
  const sL = Math.sin(phi);
  const liftL = Math.max(0, -Math.cos(phi)) * 0.32;
  const liftR = Math.max(0, Math.cos(phi)) * 0.32;
  const bob = Math.abs(Math.cos(phi)) * 0.04;
  return {
    hipL: [-0.1, 0.92 + bob, 0], hipR: [0.1, 0.92 + bob, 0],
    kneeL: [-0.11, 0.52 + liftL * 0.35 + bob, 0.22 * sL + liftL * 0.35], kneeR: [0.11, 0.52 + liftR * 0.35 + bob, -0.22 * sL + liftR * 0.35],
    footL: [-0.12, 0.04 + liftL, 0.42 * sL], footR: [0.12, 0.04 + liftR, -0.42 * sL],
    shL: [-0.21, 1.42 + bob, lean], shR: [0.21, 1.42 + bob, lean],
    elL: [-0.3, 1.18 + bob, lean - 0.2 * sL], elR: [0.3, 1.18 + bob, lean + 0.2 * sL],
    handL: [-0.3, 1.0 + bob, lean - 0.38 * sL], handR: [0.3, 1.0 + bob, lean + 0.38 * sL],
    neck: [0, 1.5 + bob, lean + 0.02], head: [0, 1.62 + bob, lean + 0.05],
  };
}

// The keeper, facing us. u across (+ is our right), v up; rotated about the hips for a dive.
export const KEEPER_READY = {
  hipL: [-0.13, 0.84], hipR: [0.13, 0.84], kneeL: [-0.3, 0.46], kneeR: [0.3, 0.46], footL: [-0.32, 0.04], footR: [0.32, 0.04],
  shL: [-0.23, 1.36], shR: [0.23, 1.36], elL: [-0.44, 1.12], elR: [0.44, 1.12], handL: [-0.52, 0.98], handR: [0.52, 0.98], neck: [0, 1.44], head: [0, 1.58],
};
const KEEPER_STRETCH = {
  hipL: [-0.12, 0.92], hipR: [0.12, 0.92], kneeL: [-0.16, 0.5], kneeR: [0.13, 0.53], footL: [-0.22, 0.06], footR: [0.12, 0.1],
  shL: [-0.18, 1.45], shR: [0.22, 1.45], elL: [-0.02, 1.9], elR: [0.26, 1.88], handL: [0.04, 2.24], handR: [0.22, 2.2], neck: [0.02, 1.53], head: [0.05, 1.66],
};
const KEEPER_STAR = {
  ...KEEPER_READY, hipL: [-0.12, 0.92], hipR: [0.12, 0.92], kneeL: [-0.26, 0.5], kneeR: [0.26, 0.5], footL: [-0.34, 0.02], footR: [0.34, 0.02],
  shL: [-0.22, 1.45], shR: [0.22, 1.45], elL: [-0.46, 1.7], elR: [0.46, 1.7], handL: [-0.62, 1.96], handR: [0.62, 1.96], neck: [0, 1.53], head: [0, 1.67],
};
const mirror = (pose) => {
  const out = {};
  for (const k of JOINTS) {
    const other = k.endsWith("L") ? k.slice(0, -1) + "R" : k.endsWith("R") ? k.slice(0, -1) + "L" : k;
    out[other] = [-pose[k][0], pose[k][1], 0];
  }
  return out;
};
const withZ = (pose) => Object.fromEntries(JOINTS.map((k) => [k, [pose[k][0], pose[k][1], 0]]));
export const KEEPER = { ready: withZ(KEEPER_READY), right: withZ(KEEPER_STRETCH), left: mirror(withZ(KEEPER_STRETCH)), star: withZ(KEEPER_STAR) };
const PIVOT = 0.9; // the keeper turns about his hips
const HANDS_FROM_PIVOT = Math.hypot(0.13, 2.22 - PIVOT);

/** Where the keeper ends up to get his hands to (hx, hy) on a dive to that side. */
export function divePlan(hx, hy) {
  const side = hx < 0 ? -1 : 1;
  const py = clamp(0.45 + hy * 0.35, 0.45, 1.25);
  const dy = hy - py;
  const dx = Math.sqrt(Math.max(0, HANDS_FROM_PIVOT ** 2 - dy ** 2));
  const px = hx - side * dx;
  const theta = Math.atan2(hx - px, dy) - Math.atan2(side * 0.13, 2.22 - PIVOT);
  return { side, tx: px, ty: py - PIVOT, theta };
}

/** A keeper pose turned by theta about the hips and moved by (tx, ty). */
export function placeKeeper(pose, { tx = 0, ty = 0, theta = 0 }, Z) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const out = {};
  for (const k of JOINTS) {
    const [u, v] = pose[k];
    const dv = v - PIVOT;
    out[k] = [tx + u * c + dv * s, PIVOT + ty - u * s + dv * c, Z];
  }
  return out;
}

/* ---------- shirts ---------- */

const NUMBERS = { "Lionel Messi": 10, "Cristiano Ronaldo": 7, "Kylian Mbappé": 10, "Erling Haaland": 9, "Harry Kane": 9, "Mohamed Salah": 11, "Robert Lewandowski": 9, "Vinícius Júnior": 7, "Jude Bellingham": 5, "Bukayo Saka": 7, "Cole Palmer": 10, "Lamine Yamal": 10, Neymar: 10, "Kevin De Bruyne": 11, "Bruno Fernandes": 8, "Victor Osimhen": 45, "Lautaro Martínez": 10, "Phil Foden": 47, "Son Heung-min": 7, "Antoine Griezmann": 7, "Zinedine Zidane": 10, Ronaldinho: 10, "Thierry Henry": 14, "Andrea Pirlo": 21, "Francesco Totti": 10, "Wayne Rooney": 10, "Didier Drogba": 11, "Zlatan Ibrahimović": 10, "David Beckham": 7, "Steven Gerrard": 8, "Frank Lampard": 8, "Sergio Agüero": 10, "Luis Suárez": 9, "Karim Benzema": 9, "Jay-Jay Okocha": 10, "Nwankwo Kanu": 4, "Roberto Baggio": 10, "Alessandro Del Piero": 10, "Eden Hazard": 10, Kaká: 22 };
export function shirtNumber(name = "") {
  if (NUMBERS[name]) return NUMBERS[name];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return [7, 8, 9, 10, 11, 14, 17, 19, 20, 21, 22][h % 11];
}
export const surname = (name = "") => {
  const parts = name.replace(/\(.*\)/, "").trim().split(/\s+/);
  return (parts.length > 1 ? parts.slice(-1)[0] : parts[0] || "").toUpperCase();
};

/* ---------- the order of kicks (same as api/_lib/games/shootout.js) ---------- */

export const REGULATION = 5;
export const yardsFor = (round) => (round < REGULATION ? [12, 12, 18, 18, 25][round] : 12);
export function kickInfo(order, i) {
  const round = Math.floor(i / 2);
  return { i, round, shooter: order[i % 2], keeper: order[(i + 1) % 2], yards: yardsFor(round), sudden: round >= REGULATION };
}

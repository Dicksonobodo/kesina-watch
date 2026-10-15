import { readFileSync } from "node:fs";
import { getPhoto } from "../photos.js";
import { getStore, inc } from "./store.js";
import { award, getProfile } from "./profile.js";
import { dayKey, GameError, newId, plain, rateLimit } from "./util.js";

/*
 * Mind Games: Shootout. One player shoots, the other keeps goal. The shooter aims (run-up, then a
 * pause to aim with the direction line); the keeper picks a side: left, middle or right. Neither
 * sees the other's choice until both are in. Same third = saved, different third = goal, and a
 * shot can still miss the frame (wide, over, off the post), more often from further out.
 *
 * Five kicks each, then sudden death. Rounds 1-2 are from the spot (12 yards), 3-4 from the edge
 * of the box (18), round 5 from 25 yards; sudden death goes back to the spot.
 *
 * Goal coordinates: x runs from -1 (left post, as the shooter looks at it) to 1 (right post),
 * y from 0 (the ground) to 1 (the crossbar).
 *
 * The same rules run three ways: against the computer (here), in the chat (cg/shootout.js) and
 * live head to head (battle.js).
 */

export const REGULATION = 5;
const MAX_ROUNDS = 15; // a draw after this many rounds of sudden death (never in practice)
export const ZONES = ["L", "C", "R"];
const SPREAD = { 12: 0.03, 18: 0.05, 25: 0.075 }; // how far a shot can stray from where it was aimed

export const yardsFor = (round) => (round < REGULATION ? [12, 12, 18, 18, 25][round] : 12);

/** Who shoots kick i, who keeps, and from how far. */
export function kickAt(order, i) {
  const round = Math.floor(i / 2);
  return { i, round, shooter: order[i % 2], keeper: order[(i + 1) % 2], yards: yardsFor(round), sudden: round >= REGULATION };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round3 = (v) => Math.round(v * 1000) / 1000;
const gaussian = (rng = Math.random) => {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

export const zoneOf = (x) => (x < -1 / 3 ? "L" : x > 1 / 3 ? "R" : "C");

/** Where the ball ends up and whether it was on target. */
export function outcomeAt(x, y) {
  const ax = Math.abs(x);
  if (y > 1.05 || ax > 1.045) return { on: false, result: y > 1.05 && (ax <= 1.045 || y - 1 > ax - 1) ? "over" : "wide" };
  if (ax >= 0.955) return { on: false, result: "post" };
  if (y >= 0.95) return { on: false, result: "bar" };
  return { on: true, zone: zoneOf(x) };
}

/** A shot aimed at { x, y } from this far out: a little wobble is added here. */
export function shotFrom(aim, yards, rng = Math.random) {
  const num = (v, lo, hi) => (v !== null && v !== "" && Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : null);
  const ax = num(aim?.x, -1.7, 1.7);
  const ay = num(aim?.y, 0, 1.7);
  if (ax === null || ay === null) throw new GameError("Aim at the goal, then let go to shoot.");
  const s = SPREAD[yards] ?? SPREAD[12];
  const x = round3(ax + gaussian(rng) * s);
  const y = round3(clamp(ay + gaussian(rng) * s * 0.8, 0.04, 2));
  return { x, y, ...outcomeAt(x, y) };
}

/** A rushed shot when the clock ran out (live games). */
export const lateShot = (yards) => ({ ...shotFrom({ x: (Math.random() - 0.5) * 0.9, y: 0.12 + Math.random() * 0.2 }, yards), late: true });

/* ---------- the score ---------- */

export function tally(so) {
  const goals = Object.fromEntries(so.order.map((p) => [p, 0]));
  const taken = Object.fromEntries(so.order.map((p) => [p, 0]));
  for (const k of so.kicks) {
    taken[k.shooter] += 1;
    if (k.result === "goal") goals[k.shooter] += 1;
  }
  return { goals, taken };
}

/** The winner's uid once the shootout is decided, "draw" after very long sudden death, else null. */
export function verdict(so) {
  const [a, b] = so.order;
  const { goals: g, taken: t } = tally(so);
  if (t[a] <= REGULATION && t[b] <= REGULATION) {
    if (g[a] + (REGULATION - t[a]) < g[b]) return b; // can't catch up any more
    if (g[b] + (REGULATION - t[b]) < g[a]) return a;
    return null;
  }
  if (t[a] !== t[b]) return null; // sudden death: only after both have kicked
  if (g[a] !== g[b]) return g[a] > g[b] ? a : b;
  return t[a] >= MAX_ROUNDS ? "draw" : null;
}

/** Records kick so.k with this shot and dive. Returns the kick and the winner (or null). */
export function addKick(so, shot, dive, extra = {}) {
  const info = kickAt(so.order, so.kicks.length);
  const keeperDive = ZONES.includes(dive) ? dive : "C";
  const result = shot.on ? (shot.zone === keeperDive ? "save" : "goal") : shot.result;
  const kick = { i: info.i, round: info.round, shooter: info.shooter, keeper: info.keeper, yards: info.yards, x: shot.x, y: shot.y, zone: shot.on ? shot.zone : zoneOf(shot.x), dive: keeperDive, result, ...extra };
  so.kicks.push(kick);
  so.k = so.kicks.length;
  return { kick, winner: verdict(so) };
}

export const newShootout = (order) => ({ order, kicks: [], k: 0 });

/** What every view of a shootout shows: the kicks so far, the score and the next kick. */
export function shootoutView(so, done = false) {
  const { goals } = tally(so);
  return { order: so.order, kicks: so.kicks, goals, next: done ? null : kickAt(so.order, so.kicks.length) };
}

/* ---------- real players to pick ---------- */

let curated;
let more;
function lists() {
  if (!curated) {
    curated = JSON.parse(readFileSync(new URL("./shootout_players.json", import.meta.url), "utf8"));
    const careers = JSON.parse(readFileSync(new URL("./careers.json", import.meta.url), "utf8")).filter((p) => p.name && !/^Q\d+$/.test(p.name));
    const known = new Set([...curated.shooters, ...curated.keepers].map((p) => plain(p.name)));
    const entry = (p, pos) => ({ id: `${pos}:c-${plain(p.name).replace(/ /g, "-")}`, name: p.name, team: p.path.at(-1)?.c ?? "", pos });
    more = {
      shooters: careers.filter((p) => p.pos !== "Goalkeeper" && !known.has(plain(p.name))).map((p) => entry(p, "s")),
      keepers: careers.filter((p) => p.pos === "Goalkeeper" && !known.has(plain(p.name))).map((p) => entry(p, "k")),
    };
  }
  return { curated, more };
}

/** Famous shooters and keepers with photos, plus more names (no photo yet) for the search. */
export function shootoutPlayers() {
  const { curated: c, more: m } = lists();
  return { shooters: c.shooters, keepers: c.keepers, more: { shooters: m.shooters.map(({ id, name, team }) => ({ id, name, team })), keepers: m.keepers.map(({ id, name, team }) => ({ id, name, team })) } };
}

const card = (p) => ({ id: p.id, name: p.name, team: p.team ?? "", photo: p.photo ?? null });
const pickRandom = (list, not = []) => {
  const pool = list.filter((p) => !not.includes(p.id));
  return pool[Math.floor(Math.random() * pool.length)];
};

/** A random squad of famous players (the computer's, or yours if you didn't pick). */
export function randomSquad(not = []) {
  const { curated: c } = lists();
  return { shooter: card(pickRandom(c.shooters.filter((p) => p.photo), not)), keeper: card(pickRandom(c.keepers.filter((p) => p.photo), not)) };
}

async function playerFor(id, role) {
  const { curated: c, more: m } = lists();
  const key = role === "shooter" ? "shooters" : "keepers";
  const found = c[key].find((p) => p.id === id) ?? m[key].find((p) => p.id === id);
  if (!found) throw new GameError(`Pick a ${role} from the list.`);
  if (found.photo !== undefined) return card(found);
  // Someone from the wider list: look their picture up now (never keep anyone waiting long).
  const photo = await Promise.race([getPhoto(found.name, "").catch(() => null), new Promise((r) => setTimeout(() => r(null), 3500))]);
  return card({ ...found, photo });
}

/** Your shooter and keeper from { shooter: id, keeper: id }; a random pair when nothing was picked. */
export async function squadFrom(input) {
  if (!input?.shooter && !input?.keeper) return randomSquad();
  const fallback = randomSquad();
  const [shooter, keeper] = await Promise.all([input.shooter ? playerFor(String(input.shooter), "shooter") : fallback.shooter, input.keeper ? playerFor(String(input.keeper), "keeper") : fallback.keeper]);
  return { shooter, keeper };
}

/* ---------- against the computer ---------- */

const CPU = "cpu";
const MAX_REWARDED_PER_DAY = 15;

// The computer keeper reads your habits: the sides you've picked lately count for more.
function cpuDive(history) {
  const w = { L: 1, C: 0.62, R: 1 };
  const recent = history.slice(-5);
  recent.forEach((z, i) => (w[z] += (0.45 * (i + 1)) / recent.length));
  // Went the same way twice running? People often switch: hedge towards the other sides a little.
  if (recent.length >= 2 && recent.at(-1) === recent.at(-2)) for (const z of ZONES) if (z !== recent.at(-1)) w[z] += 0.25;
  const total = w.L + w.C + w.R;
  let r = Math.random() * total;
  for (const z of ZONES) if ((r -= w[z]) <= 0) return z;
  return "C";
}

// The computer shooter: mostly corners, now and then down the middle; long shots can miss.
function cpuShot(yards) {
  const r = Math.random();
  const zone = r < 0.42 ? "L" : r < 0.84 ? "R" : "C";
  const x = zone === "C" ? (Math.random() - 0.5) * 0.4 : (zone === "L" ? -1 : 1) * (0.5 + Math.random() * 0.36);
  return shotFrom({ x, y: 0.12 + Math.random() * 0.62 }, yards);
}

function soloView(id, s) {
  const done = s.status === "done";
  return {
    session: id,
    status: s.status,
    winner: s.winner ?? null,
    me: s.uid,
    players: [{ uid: s.uid, name: s.name }, { uid: CPU, name: "Computer" }],
    squads: s.squads,
    ...shootoutView(s.so, done),
  };
}

export async function startSolo(identity, { squad } = {}) {
  rateLimit(`so:${identity.uid}`, 40);
  const [mine, profile] = await Promise.all([squadFrom(squad), getProfile(identity)]);
  const cpu = randomSquad([mine.shooter.id, mine.keeper.id]);
  const id = newId(12);
  const s = { uid: identity.uid, name: profile.name, kind: "shootout", status: "playing", winner: null, so: newShootout([identity.uid, CPU]), squads: { [identity.uid]: mine, [CPU]: cpu }, habits: [], startedAt: Date.now() };
  const store = await getStore();
  await store.set(`so_sessions/${id}`, s);
  return soloView(id, s);
}

export async function playSolo(identity, id, body) {
  rateLimit(`sokick:${identity.uid}`, 120);
  const store = await getStore();
  const s = await store.get(`so_sessions/${id}`);
  if (!s || s.uid !== identity.uid) throw new GameError("That shootout wasn't found.", 404);
  if (s.status !== "playing") throw new GameError("This shootout is over.");
  const next = kickAt(s.so.order, s.so.kicks.length);
  let shot;
  let dive;
  if (next.shooter === identity.uid) {
    shot = shotFrom(body.shot, next.yards);
    dive = cpuDive(s.habits);
    s.habits.push(zoneOf(shot.x));
  } else {
    if (!ZONES.includes(body.dive)) throw new GameError("Pick a side to dive.");
    dive = body.dive;
    shot = cpuShot(next.yards);
  }
  const { kick, winner } = addKick(s.so, shot, dive);
  let reward = null;
  if (winner) {
    s.status = "done";
    s.winner = winner;
    reward = await soloReward(identity, s);
  }
  await store.set(`so_sessions/${id}`, s);
  return { ...soloView(id, s), kick, reward };
}

async function soloReward(identity, s) {
  const store = await getStore();
  const counter = `so_daily_${dayKey()}/${identity.uid}`;
  const used = (await store.get(counter))?.n ?? 0;
  if (used >= MAX_REWARDED_PER_DAY) return null;
  await store.set(counter, { n: inc(1) }, { merge: true });
  const won = s.winner === identity.uid;
  const { goals } = tally(s.so);
  const saves = s.so.kicks.filter((k) => k.keeper === identity.uid && k.result === "save").length;
  return award(identity, { xp: (won ? 30 : s.winner === "draw" ? 18 : 10) + goals[identity.uid] * 2 + saves * 2, coins: won ? 10 : 3, stats: { shootouts: 1, ...(won ? { shootoutsWon: 1 } : {}) } });
}

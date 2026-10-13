import { getPlayer } from "../football.js";
import { getPhoto } from "../photos.js";
import { leagueById } from "../sports.js";
import { playerPool } from "./content.js";
import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { addBoardPoints } from "./leaderboard.js";
import { dayKey, GameError, newId, plain, rngFrom, sample } from "./util.js";

/*
 * Guess the player: clues are revealed one at a time by the server (the answer never reaches the
 * browser until the round ends). Fewer clues = more points. Daily mode: the same player for
 * everyone, one try per day.
 */

const POINTS = [100, 80, 60, 40, 25, 10];

async function clueSet(entry) {
  const d = await getPlayer(entry.league, entry.id);
  if (!d?.name || !d.nationality || !d.position || !d.team) return null;
  const clues = [
    { label: "Nationality & position", text: `${d.nationality} · ${d.position}` },
    { label: "Plays in", text: leagueById(entry.league)?.name ?? "Europe" },
    ...(d.age || d.jersey ? [{ label: "Age & shirt", text: [d.age && `${d.age} years old`, d.jersey && `wears #${d.jersey}`].filter(Boolean).join(" · ") }] : []),
    ...(d.height || d.born ? [{ label: "Height & birthday", text: [d.height, d.born && `born ${d.born}`].filter(Boolean).join(" · ") }] : []),
    { label: "Current club", text: d.team },
  ];
  const photo = d.photo || (await getPhoto(d.name, d.team));
  const initials = d.name.split(" ").filter(Boolean).map((p) => `${p[0]}.`).join(" ");
  clues.push({ label: photo ? "Photo" : "Initials", text: photo ? "" : initials, photo: photo ?? null });
  return { name: d.name, team: d.team, nationality: d.nationality, position: d.position, photo: photo ?? null, clues };
}

export async function startGuess(identity, { daily = false } = {}) {
  const store = await getStore();
  const today = dayKey();
  if (daily) {
    const row = await store.get(`daily_${today}/${identity.uid}`);
    if (row?.guess != null) throw new GameError("You've already played today's player. Come back tomorrow!");
  }
  const pool = await playerPool();
  const rng = daily ? rngFrom(`guess-${today}`) : Math.random;
  let chosen = null;
  for (const entry of sample(pool, 6, rng)) {
    chosen = await clueSet(entry).catch(() => null);
    if (chosen && chosen.clues.length >= 5) break;
    chosen = null;
  }
  if (!chosen) throw new GameError("Couldn't pick a player right now. Try again in a minute.", 503);

  const id = newId(12);
  await store.set(`sessions/${id}`, {
    uid: identity.uid,
    kind: "guess",
    daily,
    day: today,
    answer: { name: chosen.name, team: chosen.team, nationality: chosen.nationality, position: chosen.position, photo: chosen.photo },
    clues: chosen.clues,
    revealed: 1,
    guesses: [],
    status: "active",
    createdAt: Date.now(),
  });
  return { session: id, daily, total: chosen.clues.length, points: POINTS.slice(0, chosen.clues.length), clues: [chosen.clues[0]], revealed: 1 };
}

function isCorrect(guess, fullName) {
  const g = plain(guess).split(" ").filter(Boolean);
  const n = plain(fullName).split(" ").filter(Boolean);
  if (!g.length) return false;
  const last = n[n.length - 1];
  return g.every((t) => n.includes(t)) && g.includes(last);
}

async function loadActive(identity, id) {
  const store = await getStore();
  const s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid || s.kind !== "guess") throw new GameError("That round wasn't found.", 404);
  if (s.status !== "active") throw new GameError("This round is already finished.");
  return { store, s };
}

async function finish(identity, store, id, s, correct) {
  s.status = "done";
  const points = correct ? POINTS[Math.min(s.revealed, POINTS.length) - 1] : 0;
  await store.set(`sessions/${id}`, s);
  const reward = await award(identity, {
    xp: correct ? Math.round(points / 4) + (s.daily ? 15 : 0) : 3,
    coins: correct ? Math.ceil(points / 20) : 0,
    stats: { ...(correct ? { guessWins: 1 } : {}), ...(correct && s.revealed <= 2 ? { guessFast: 1 } : {}), ...(s.daily ? { dailyDone: 0 } : {}) },
  });
  if (s.daily) {
    await store.set(`daily_${s.day}/${identity.uid}`, { guess: points }, { merge: true });
    const profile = await getProfile(identity);
    if (points) await addBoardPoints("daily", identity, profile, points);
  }
  return { done: true, correct, points, answer: s.answer, cluesUsed: s.revealed, reward };
}

export async function guessAnswer(identity, id, name) {
  const { store, s } = await loadActive(identity, id);
  const text = String(name ?? "").trim().slice(0, 60);
  if (text.length < 2) throw new GameError("Type a player's name.");
  s.guesses.push(text);
  if (isCorrect(text, s.answer.name)) return finish(identity, store, id, s, true);
  if (s.revealed >= s.clues.length) return finish(identity, store, id, s, false);
  s.revealed += 1;
  await store.set(`sessions/${id}`, s);
  return { done: false, correct: false, clue: s.clues[s.revealed - 1], revealed: s.revealed };
}

/** Skip to the next clue without guessing (costs the same points as a wrong guess). */
export async function guessReveal(identity, id) {
  const { store, s } = await loadActive(identity, id);
  if (s.revealed >= s.clues.length) return finish(identity, store, id, s, false);
  s.revealed += 1;
  await store.set(`sessions/${id}`, s);
  return { done: false, clue: s.clues[s.revealed - 1], revealed: s.revealed };
}

export async function guessGiveUp(identity, id) {
  const { store, s } = await loadActive(identity, id);
  return finish(identity, store, id, s, false);
}

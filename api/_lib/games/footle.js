import { getPlayer } from "../football.js";
import { leagueById } from "../sports.js";
import { playerPool } from "./content.js";
import { getStore } from "./store.js";
import { award, getProfile } from "./profile.js";
import { addBoardPoints } from "./leaderboard.js";
import { dayKey, GameError, newId, rateLimit, rngFrom, sample } from "./util.js";

/*
 * Footle: guess the footballer in 8 tries. Every guess is a real player from the list, and each
 * one tells you how close it is: country, position, league, club, age and shirt number turn
 * green (right), yellow (close) or grey (wrong), with arrows for age and number. The same player
 * for everyone each day, or practise on random ones.
 */

const TRIES = 8;
const POINTS = [150, 120, 100, 80, 60, 45, 30, 20];

const line = (position = "") => {
  const p = position.toLowerCase();
  if (/goal/.test(p)) return "Goalkeeper";
  if (/defen|back/.test(p)) return "Defender";
  if (/mid/.test(p)) return "Midfielder";
  if (/forward|striker|wing|attack/.test(p)) return "Forward";
  return position || "?";
};

async function attrs(entry) {
  const d = await getPlayer(entry.league, entry.id);
  if (!d?.name) throw new GameError("That player's details aren't available right now. Try another.", 503);
  return {
    id: entry.id,
    name: d.name,
    photo: d.photo ?? null,
    team: d.team ?? entry.team ?? "?",
    teamLogo: d.teamLogo ?? null,
    nationality: d.nationality ?? "?",
    flag: d.flag ?? null,
    position: line(d.position),
    league: leagueById(entry.league)?.name ?? "?",
    age: d.age ?? null,
    jersey: d.jersey ? Number(d.jersey) : null,
  };
}

const num = (guess, answer, near) => {
  if (guess == null || answer == null) return { status: "miss" };
  if (guess === answer) return { status: "match" };
  return { status: Math.abs(guess - answer) <= near ? "near" : "miss", hint: guess < answer ? "up" : "down" };
};
const same = (a, b) => ({ status: a && a === b ? "match" : "miss" });

function compare(g, a) {
  return [
    { key: "country", label: "Country", value: g.nationality, flag: g.flag, ...same(g.nationality, a.nationality) },
    { key: "position", label: "Position", value: g.position, ...same(g.position, a.position) },
    { key: "league", label: "League", value: g.league, ...same(g.league, a.league) },
    { key: "club", label: "Club", value: g.team, logo: g.teamLogo, ...same(g.team, a.team) },
    { key: "age", label: "Age", value: g.age ?? "?", ...num(g.age, a.age, 2) },
    { key: "number", label: "Shirt", value: g.jersey != null ? `#${g.jersey}` : "?", ...num(g.jersey, a.jersey, 3) },
  ];
}

/** Everyone you can guess (names and clubs only; the details are looked up per guess). */
export async function footlePlayers() {
  const pool = await playerPool();
  return pool.map((p) => ({ id: p.id, name: p.name, team: p.team })).sort((a, b) => a.name.localeCompare(b.name));
}

async function dailyAnswer(store, pool) {
  const day = dayKey();
  const path = `footle_day/${day}`;
  const saved = await store.get(path);
  if (saved?.id) return pool.find((p) => p.id === saved.id) ?? { id: saved.id, league: saved.league, name: saved.name, team: saved.team };
  // The first player of the day picks; everyone after gets the same one.
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const pick = sample(sorted, 1, rngFrom(`footle-${day}`))[0];
  await store.set(path, { id: pick.id, league: pick.league, name: pick.name, team: pick.team }, { merge: true });
  const final = await store.get(path);
  return pool.find((p) => p.id === final.id) ?? pick;
}

const view = (s) => ({ session: s.id, daily: s.daily, tries: TRIES, guesses: s.guesses });

export async function startFootle(identity, { daily = false } = {}) {
  rateLimit(`footle:${identity.uid}`, 20);
  const store = await getStore();
  const today = dayKey();
  const pool = await playerPool().catch(() => null);
  if (!pool) throw new GameError("The player list isn't available right now. Try again in a minute.", 503);

  if (daily) {
    const row = await store.get(`daily_${today}/${identity.uid}`);
    if (row?.footle != null) throw new GameError("You've already played today's Footle. Come back tomorrow!");
    // Reloading the page picks the same round up again; it can't be used to start over.
    if (row?.footleSession) {
      const s = await store.get(`sessions/${row.footleSession}`);
      if (s?.uid === identity.uid && s.status === "active") return view(s);
    }
  }
  const answer = daily ? await dailyAnswer(store, pool) : sample(pool, 1)[0];
  const s = { id: newId(12), uid: identity.uid, kind: "footle", daily, day: today, status: "active", answerId: answer.id, league: answer.league, guesses: [], createdAt: Date.now() };
  await store.set(`sessions/${s.id}`, s);
  if (daily) await store.set(`daily_${today}/${identity.uid}`, { footleSession: s.id }, { merge: true });
  return view(s);
}

export async function guessFootle(identity, id, playerId) {
  rateLimit(`footleg:${identity.uid}`, 60);
  const store = await getStore();
  const s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid || s.kind !== "footle") throw new GameError("That round wasn't found.", 404);
  if (s.status !== "active") throw new GameError("This round is finished.");
  const pool = await playerPool();
  const entry = pool.find((p) => p.id === String(playerId));
  if (!entry) throw new GameError("Pick a player from the list.");
  if (s.guesses.some((g) => g.id === entry.id)) throw new GameError("You already tried that player.");

  const answerEntry = pool.find((p) => p.id === s.answerId) ?? { id: s.answerId, league: s.league };
  const [g, a] = await Promise.all([attrs(entry), attrs(answerEntry)]);
  const correct = g.id === a.id;
  s.guesses.push({ id: g.id, name: g.name, photo: g.photo, cells: compare(g, a) });
  const out = s.guesses.length >= TRIES;
  if (!correct && !out) {
    await store.set(`sessions/${id}`, s);
    return { done: false, guess: s.guesses.at(-1), left: TRIES - s.guesses.length };
  }

  s.status = "done";
  const points = correct ? POINTS[s.guesses.length - 1] : 0;
  await store.set(`sessions/${id}`, s);
  const profile = await getProfile(identity);
  const [reward] = await Promise.all([
    award(identity, {
      profile,
      xp: correct ? Math.round(points / 5) + (s.daily ? 15 : 0) : 4,
      coins: correct ? Math.ceil(points / 25) : 0,
      stats: { ...(correct ? { footleWins: 1 } : {}), ...(correct && s.guesses.length <= 3 ? { footleFast: 1 } : {}) },
    }),
    s.daily ? store.set(`daily_${s.day}/${identity.uid}`, { footle: points }, { merge: true }) : null,
    s.daily && points ? addBoardPoints("daily", identity, profile, points) : null,
  ]);
  return { done: true, correct, points, guess: s.guesses.at(-1), answer: { name: a.name, team: a.team, teamLogo: a.teamLogo, nationality: a.nationality, position: a.position, photo: a.photo }, reward, tries: s.guesses.length };
}

export async function giveUpFootle(identity, id) {
  const store = await getStore();
  const s = await store.get(`sessions/${id}`);
  if (!s || s.uid !== identity.uid || s.kind !== "footle") throw new GameError("That round wasn't found.", 404);
  if (s.status !== "active") throw new GameError("This round is finished.");
  s.status = "done";
  await store.set(`sessions/${id}`, s);
  const pool = await playerPool();
  const a = await attrs(pool.find((p) => p.id === s.answerId) ?? { id: s.answerId, league: s.league });
  const profile = await getProfile(identity);
  const reward = await award(identity, { profile, xp: 4 });
  if (s.daily) await store.set(`daily_${s.day}/${identity.uid}`, { footle: 0 }, { merge: true });
  return { done: true, correct: false, points: 0, answer: { name: a.name, team: a.team, teamLogo: a.teamLogo, nationality: a.nationality, position: a.position, photo: a.photo }, reward, tries: s.guesses.length };
}

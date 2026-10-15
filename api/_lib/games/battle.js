import { KINDS, questionsFor } from "./sessions.js";
import { getStore, inc } from "./store.js";
import { award, getProfile, levelFor } from "./profile.js";
import { dayKey, GameError, rateLimit } from "./util.js";

/*
 * Head-to-head battles: two players, the same 10 questions, speed counts.
 *
 * The room document (rooms/{code}) is what both browsers watch (Firestore live updates in
 * production, polling in development). It holds the questions WITHOUT answers. The answers and
 * each player's picks live in rooms_secret/{code}, which browsers can't read, so nobody can peek.
 * No server runs the clock: every answer (and a "tick" when time is up) goes through a function
 * that moves the room forward, and all of it is safe to repeat.
 */

// What can be played head to head (same builders as the solo games). "daily" is solo only.
export const BATTLE_KINDS = ["quiz", "shirt", "clubs", "trophy", "xi", "career", "hilo"];
const COUNTDOWN_MS = 3500; // before the first question
const REVEAL_MS = 3000; // pause between questions to show the answer
const GRACE_MS = 2500;
const BASE = { easy: 80, medium: 100, hard: 130 };
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");

async function freshCode(store) {
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    if (!(await store.get(`rooms/${code}`))) return code;
  }
  throw new GameError("Couldn't create a room. Try again.", 503);
}

async function playerEntry(identity) {
  const p = await getProfile(identity);
  return { uid: identity.uid, name: p.name, avatar: p.avatar, theme: p.theme, level: levelFor(p.xp), score: 0, correct: 0, missed: 0 };
}

/** What a browser may see of a room (never answers or hidden picks). */
export const publicRoom = (room) => room;

function memberOnly(room, uid) {
  if (!room) throw new GameError("That room doesn't exist.", 404);
  if (!room.memberIds.includes(uid)) throw new GameError("You're not in this room.", 403);
}

const kindOf = (kind) => (BATTLE_KINDS.includes(kind) ? kind : "quiz");

export async function createRoom(identity, { difficulty = "mixed", isPublic = false, kind = "quiz" } = {}) {
  rateLimit(`room:${identity.uid}`, 10);
  kind = kindOf(kind);
  const store = await getStore();
  const code = await freshCode(store);
  const me = await playerEntry(identity);
  const room = {
    code,
    host: identity.uid,
    memberIds: [identity.uid],
    players: { [identity.uid]: me },
    status: "waiting",
    public: Boolean(isPublic),
    difficulty,
    kind,
    title: KINDS[kind].title,
    hostLevel: me.level,
    qs: [],
    idx: 0,
    seconds: KINDS[kind].seconds,
    qStartedAt: 0,
    lastAnswered: {},
    reveals: [],
    createdAt: Date.now(),
    rematch: null,
    winner: null,
  };
  await store.set(`rooms/${code}`, room);
  return room;
}

export async function joinRoom(identity, code) {
  rateLimit(`join:${identity.uid}`, 20);
  const store = await getStore();
  const id = String(code ?? "").toUpperCase().trim();
  const room = await store.get(`rooms/${id}`);
  if (!room) throw new GameError("No room with that code. Check it and try again.", 404);
  if (room.memberIds.includes(identity.uid)) return room; // rejoining
  if (room.status !== "waiting" || room.memberIds.length >= 2) throw new GameError("That room is already full or has started.");

  const me = await playerEntry(identity);
  const kind = kindOf(room.kind);
  const qs = await questionsFor(kind, { difficulty: room.difficulty, seed: kind === "xi" ? dayKey() : null });
  if (!qs.length) throw new GameError("Couldn't build that game right now. Try another one, or try again in a minute.", 503);
  const startsAt = Date.now() + COUNTDOWN_MS;
  const next = {
    memberIds: [...room.memberIds, identity.uid],
    [`players.${identity.uid}`]: me,
    status: "playing",
    qs: qs.map(({ id, text, options, category, difficulty, source, by, meta }) => ({ id, text, options, category, difficulty, source, by: by ?? null, meta: meta ?? null })),
    idx: 0,
    qStartedAt: startsAt,
    startedAt: Date.now(),
    lastAnswered: {},
  };
  await store.set(`rooms_secret/${id}`, { answers: qs.map((q) => q.answer), picks: {} });
  await store.update(`rooms/${id}`, next);
  return { ...room, ...next, players: { ...room.players, [identity.uid]: me } };
}

export async function getRoom(identity, code) {
  const store = await getStore();
  const room = await store.get(`rooms/${String(code).toUpperCase()}`);
  memberOnly(room, identity.uid);
  return publicRoom(room);
}

/* ---------- quick match: pair with someone of a similar level ---------- */

export async function quickMatch(identity, { difficulty = "mixed", kind = "quiz" } = {}) {
  rateLimit(`quick:${identity.uid}`, 12);
  kind = kindOf(kind);
  const store = await getStore();
  const me = await playerEntry(identity);
  const waiting = (await store.list("rooms", { where: [["status", "==", "waiting"], ["public", "==", true]], limit: 25 })).filter(
    (r) => !r.memberIds.includes(identity.uid) && Date.now() - r.createdAt < 90_000 && kindOf(r.kind) === kind, // only players who picked the same game
  );
  // Closest level first; widen the allowed gap the longer someone has waited.
  const fits = waiting
    .map((r) => ({ r, gap: Math.abs(r.hostLevel - me.level), waited: Date.now() - r.createdAt }))
    .filter((x) => x.gap <= 2 + Math.floor(x.waited / 10_000))
    .sort((a, b) => a.gap - b.gap || a.r.createdAt - b.r.createdAt);
  if (fits.length) return joinRoom(identity, fits[0].r.code);

  const room = await createRoom(identity, { difficulty, isPublic: true, kind });
  // Two people searching at the same moment: the later room joins the earlier one.
  const rivals = (await store.list("rooms", { where: [["status", "==", "waiting"], ["public", "==", true]], limit: 25 })).filter(
    (r) => r.code !== room.code && !r.memberIds.includes(identity.uid) && kindOf(r.kind) === kind && r.createdAt <= room.createdAt && Math.abs(r.hostLevel - me.level) <= 3,
  );
  if (rivals.length) {
    await store.delete(`rooms/${room.code}`);
    return joinRoom(identity, rivals.sort((a, b) => a.createdAt - b.createdAt)[0].code);
  }
  return room;
}

export async function cancelRoom(identity, code) {
  const store = await getStore();
  const id = String(code).toUpperCase();
  const room = await store.get(`rooms/${id}`);
  if (!room || room.host !== identity.uid || room.status !== "waiting") return { ok: true };
  await store.delete(`rooms/${id}`);
  return { ok: true };
}

/* ---------- playing ---------- */

const pointsFor = (q, elapsed, seconds) => {
  const base = BASE[q.difficulty] ?? 100;
  const remaining = Math.max(0, 1 - Math.min(elapsed, seconds * 1000) / (seconds * 1000));
  return base + Math.round(base * 0.5 * remaining);
};

export async function answerRoom(identity, code, { index, choice }) {
  const store = await getStore();
  const id = String(code).toUpperCase();
  const room = await store.get(`rooms/${id}`);
  memberOnly(room, identity.uid);
  if (room.status !== "playing") throw new GameError("This battle isn't running.");
  if (index !== room.idx) return room; // too late: that question already moved on
  if (room.lastAnswered?.[identity.uid] === index) return room;
  if (Date.now() < room.qStartedAt) throw new GameError("Wait for the question to start.");

  const secret = await store.get(`rooms_secret/${id}`);
  const elapsed = Date.now() - room.qStartedAt;
  const inTime = elapsed <= room.seconds * 1000 + GRACE_MS;
  const q = room.qs[index];
  const ok = inTime && Number.isInteger(choice) && choice === secret.answers[index];
  const pick = { choice: Number.isInteger(choice) ? choice : -1, ok, points: ok ? pointsFor(q, elapsed, room.seconds) : 0, ms: elapsed };
  // Each player writes only their own fields, so two answers at the same moment can't overwrite each other.
  await store.set(`rooms_secret/${id}`, { [`picks.${index}.${identity.uid}`]: pick }, { merge: true });
  await store.update(`rooms/${id}`, { [`lastAnswered.${identity.uid}`]: index });

  const after = await store.get(`rooms_secret/${id}`);
  const picks = after.picks?.[index] ?? {};
  if (room.memberIds.every((uid) => picks[uid])) return closeQuestion(store, id, secret.answers[index], index);
  return store.get(`rooms/${id}`);
}

/** Anyone in the room can call this when the clock runs out; it does nothing if time isn't up. */
export async function tickRoom(identity, code) {
  const store = await getStore();
  const id = String(code).toUpperCase();
  const room = await store.get(`rooms/${id}`);
  memberOnly(room, identity.uid);
  if (room.status !== "playing") return room;
  if (Date.now() < room.qStartedAt + room.seconds * 1000 + GRACE_MS) return room;
  const secret = await store.get(`rooms_secret/${id}`);
  return closeQuestion(store, id, secret.answers[room.idx], room.idx);
}

// Scores the question and moves the room on. Only one caller can win the compare-and-set that
// advances it, so answering and ticking at the same time can't count a question twice.
async function closeQuestion(store, id, answer, index) {
  const room = await store.get(`rooms/${id}`);
  if (room.status !== "playing" || room.idx !== index) return room; // someone else already closed it
  const secret = await store.get(`rooms_secret/${id}`);
  const picks = secret.picks?.[index] ?? {};
  const reveal = { qi: index, answer, picks: {} };
  const players = structuredClone(room.players);
  const update = {};
  for (const uid of room.memberIds) {
    const pick = picks[uid] ?? { choice: -1, ok: false, points: 0 };
    reveal.picks[uid] = { choice: pick.choice, ok: pick.ok, points: pick.points };
    players[uid].score += pick.points;
    if (pick.ok) players[uid].correct += 1;
    // Missing 3 questions in a row means they left: the other player wins.
    players[uid].missed = pick.choice === -1 ? (players[uid].missed ?? 0) + 1 : 0;
    update[`players.${uid}`] = players[uid];
  }
  update.reveals = [...room.reveals, reveal];
  const forfeit = room.memberIds.find((uid) => players[uid].missed >= 3);

  const last = index + 1 >= room.qs.length || Boolean(forfeit);
  if (last) {
    const [a, b] = room.memberIds;
    Object.assign(update, {
      status: "done",
      finishedAt: Date.now(),
      forfeit: forfeit ?? null,
      winner: forfeit ? room.memberIds.find((u) => u !== forfeit) : players[a].score === players[b].score ? "draw" : players[a].score > players[b].score ? a : b,
    });
  } else {
    Object.assign(update, { idx: index + 1, qStartedAt: Date.now() + REVEAL_MS });
  }

  const won = await store.cas(`rooms/${id}`, { idx: index, status: "playing" }, update);
  if (!won) return store.get(`rooms/${id}`);
  const next = await store.get(`rooms/${id}`);
  if (last) await settle(next);
  return next;
}

async function settle(room) {
  const store = await getStore();
  const [a, b] = room.memberIds;
  for (const [uid, opp] of [[a, b], [b, a]]) {
    const me = room.players[uid];
    const them = room.players[opp];
    const won = room.winner === uid;
    const draw = room.winner === "draw";
    const xp = (won ? 60 : draw ? 40 : 20) + Math.round(me.score / 25);
    const coins = (won ? 15 : draw ? 8 : 4) + me.correct;
    await award({ uid, name: me.name }, { xp, coins, stats: { battles: 1, ...(won ? { battlesWon: 1 } : {}) } });
    // Head-to-head record against this opponent (the "friends ranking").
    await store.set(
      `rivals/${uid}`,
      { [`opp.${opp}.name`]: them.name, [`opp.${opp}.avatar`]: them.avatar, [`opp.${opp}.${won ? "w" : draw ? "d" : "l"}`]: inc(1) },
      { merge: true },
    );
  }
}

export async function rematch(identity, code) {
  const store = await getStore();
  const id = String(code).toUpperCase();
  const room = await store.get(`rooms/${id}`);
  memberOnly(room, identity.uid);
  if (room.status !== "done") throw new GameError("Finish the battle first.");
  if (room.rematch) return { code: room.rematch };
  const next = await createRoom(identity, { difficulty: room.difficulty, kind: room.kind });
  await store.update(`rooms/${id}`, { rematch: next.code });
  return { code: next.code };
}

/** Your record against everyone you've battled (the friends ranking). */
export async function friendsRanking(identity) {
  const store = await getStore();
  const doc = await store.get(`rivals/${identity.uid}`);
  const rows = Object.entries(doc?.opp ?? {}).map(([uid, r]) => ({ uid, name: r.name, avatar: r.avatar ?? "⚽", wins: r.w ?? 0, losses: r.l ?? 0, draws: r.d ?? 0 }));
  return rows.sort((x, y) => y.wins - y.losses - (x.wins - x.losses) || y.wins - x.wins).slice(0, 30);
}

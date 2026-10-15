import { getStore, inc } from "./store.js";
import { award } from "./profile.js";
import { canMessage, chatIdOf, postGame, touchGame } from "./chat.js";
import * as swipe from "./cg/swipe.js";
import * as whot from "./cg/whot.js";
import * as darts from "./cg/darts.js";
import * as behind from "./cg/behind.js";
import * as ttt from "./cg/ttt.js";
import * as shootout from "./cg/shootout.js";
import { dayKey, GameError, newId, rateLimit } from "./util.js";

/*
 * Games played inside a chat (Word Swipe, Naija Whot, Darts). One document per game holds the
 * public state and, for Whot, the hidden hands and market; browsers never read it directly, only
 * through `cg.get`, which sends each player what they are allowed to see.
 */

const GAMES = { swipe, whot, darts, behind, ttt, shootout };
const MAX_REWARDED_PER_DAY = 8; // so two friends can't farm XP by playing all day

const path = (id) => `cgames/${id}`;

async function load(store, identity, id) {
  const g = await store.get(path(id));
  if (!g || !g.players.includes(identity.uid)) throw new GameError("That game wasn't found.", 404);
  return g;
}

const cardOf = (g) => ({ id: g.id, type: g.type, title: GAMES[g.type].title, status: g.status, turn: g.turn ?? null, winner: g.winner ?? null, ...GAMES[g.type].card(g) });

function viewOf(g, uid) {
  const m = GAMES[g.type];
  return {
    id: g.id,
    type: g.type,
    title: m.title,
    chat: g.chatId,
    status: g.status,
    turn: g.turn ?? null,
    winner: g.winner ?? null,
    me: uid,
    players: g.players.map((p) => ({ uid: p, name: g.names[p] })),
    v: g.v,
    now: Date.now(),
    ...m.view(g, uid),
  };
}

export async function createGame(identity, { peer, type }) {
  rateLimit(`cgnew:${identity.uid}`, 12);
  const m = GAMES[type];
  if (!m) throw new GameError("Pick a game.");
  const store = await getStore();
  const [me, them] = await Promise.all([store.get(`dir/${identity.uid}`), store.get(`dir/${peer}`)]);
  if (!me) throw new GameError("Open the Game Zone once so friends can find you, then try again.");
  if (!them || peer === identity.uid) throw new GameError("That player wasn't found.", 404);
  await canMessage(identity, peer); // blocked either way? say so before anything is made
  const players = [identity.uid, peer]; // the one who starts the game plays first
  const made = m.create(players);
  const id = newId(10);
  const g = {
    id,
    type,
    players,
    names: { [identity.uid]: me.name, [peer]: them.name },
    chatId: chatIdOf(identity.uid, peer),
    status: "playing",
    turn: made.turn,
    winner: null,
    v: 1,
    state: made.state,
    secret: made.secret,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  // Like iMessage: the game only appears in the conversation once you've played your turn.
  await store.set(path(id), { ...g, msgId: null });
  return { game: viewOf(g, identity.uid), chat: g.chatId };
}

export async function getGame(identity, id, v = -1) {
  const store = await getStore();
  const g = await load(store, identity, id);
  if (g.v === v) return { unchanged: true, v: g.v, now: Date.now() };
  return { game: viewOf(g, identity.uid) };
}

async function rewards(g) {
  const store = await getStore();
  const day = dayKey();
  const out = {};
  await Promise.all(
    g.players.map(async (uid) => {
      const counter = `cg_daily_${day}/${uid}`;
      const used = (await store.get(counter))?.n ?? 0;
      if (used >= MAX_REWARDED_PER_DAY) return;
      const won = g.winner === uid;
      const draw = g.winner === "draw";
      const reward = await award({ uid, name: g.names[uid] }, { xp: won ? 25 : draw ? 15 : 10, coins: won ? 8 : 2, stats: { chatGames: 1, ...(won ? { chatGamesWon: 1 } : {}) } });
      await store.set(counter, { n: inc(1) }, { merge: true });
      out[uid] = reward;
    }),
  );
  return out;
}

export async function moveGame(identity, id, body) {
  rateLimit(`cgmove:${identity.uid}`, 240);
  const store = await getStore();
  for (let attempt = 0; attempt < 3; attempt++) {
    const g = await load(store, identity, id);
    const m = GAMES[g.type];
    const turnBefore = g.turn;
    const result = await m.move(g, identity.uid, body); // some moves look things up (a player's photo)
    if (result.ended) {
      g.status = "done";
      g.winner = result.winner;
      g.turn = null;
    }
    const patch = { state: g.state, secret: g.secret, status: g.status, turn: g.turn ?? null, winner: g.winner ?? null, v: g.v + 1, updatedAt: Date.now() };
    if (!(await store.cas(path(id), { v: g.v }, patch))) continue; // the other player moved at the same moment: try again on fresh data
    g.v += 1;
    const done = g.status === "done";
    const other = g.players.find((p) => p !== identity.uid);
    // A turn handed over (or the game finished, or a Word Swipe round played): send it into the chat.
    const handoff = done || Boolean(result.handoff) || (turnBefore === identity.uid && g.turn === other) || (g.type === "swipe" && body.type === "submit");
    const deliverToChat = async () => {
      if (handoff) {
        const posted = await postGame(identity, other, cardOf(g), g.msgId);
        g.msgId = posted.msgId;
        await store.update(path(id), { msgId: posted.msgId });
      } else if (g.msgId) await touchGame(g.chatId, g.msgId, cardOf(g));
    };
    const [rewardsByUid] = await Promise.all([done ? rewards(g) : null, deliverToChat().catch(() => {})]);
    return { game: viewOf(g, identity.uid), result: { dart: result.dart ?? null, bust: Boolean(result.bust), kick: result.kick ?? null }, sent: handoff, reward: rewardsByUid?.[identity.uid] ?? null };
  }
  throw new GameError("That took too long. Try again.", 409);
}

export async function rematch(identity, id) {
  const store = await getStore();
  const g = await load(store, identity, id);
  if (g.status !== "done") throw new GameError("Finish this game first.");
  return createGame(identity, { peer: g.players.find((p) => p !== identity.uid), type: g.type });
}

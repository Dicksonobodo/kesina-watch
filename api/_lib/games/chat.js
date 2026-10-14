import { getStore, inc, remove } from "./store.js";
import { getProfile, levelFor } from "./profile.js";
import { GameError, newId, rateLimit } from "./util.js";

/*
 * Chat for the Game Zone: one-to-one conversations like iMessage. Text, battle invites (a join
 * code that opens the room) and games played inside the conversation. Everything goes through the
 * server (so it can check blocks, lengths and rates); browsers poll `chat.sync`, which costs a
 * single small read when nothing has changed.
 *
 * Documents:
 *   dir/<uid>                  who can be found by name
 *   chats/<a_b>                one per pair: members, read marks, typing marks
 *   chatmsg_<a_b>/<id>         messages (upd changes when one is reacted to or unsent)
 *   inbox_<uid>/<a_b>          each person's conversation list entry (last message, unread count)
 *   chatmeta/<uid>             change counter `v`, total unread, blocked people
 */

const REACTIONS = ["❤️", "👍", "👎", "😂", "‼️", "❓"];
const TYPING_MS = 6000;

const chatIdOf = (a, b) => [a, b].sort().join("_");
const tagOf = (uid) => {
  let h = 0;
  for (const c of uid) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  return String(1000 + (h % 9000));
};
const clean = (text) => String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, 1000);

/* ---------- the directory (who can be found) ---------- */

const synced = new Map(); // uid → signature last written by this server instance

export async function syncDirectory(identity, profile = null) {
  const p = profile ?? (await getProfile(identity));
  const email = String(identity.email ?? "").toLowerCase();
  const sig = `${p.name}|${p.avatar}|${p.theme}|${levelFor(p.xp)}|${email}`;
  if (synced.get(identity.uid) === sig) return;
  synced.set(identity.uid, sig);
  if (synced.size > 5000) synced.clear();
  const store = await getStore();
  // What people can be found by: the display name (start of it, or its last word) and the email.
  // The email is only ever used for matching; it is never sent to anyone.
  const nameLower = p.name.toLowerCase();
  const lastWord = nameLower.split(/[^\p{L}\p{N}]+/u).filter(Boolean).at(-1) ?? nameLower;
  await store.set(`dir/${identity.uid}`, { uid: identity.uid, name: p.name, nameLower, lastWord, emailLower: email, avatar: p.avatar, theme: p.theme, level: levelFor(p.xp), tag: tagOf(identity.uid), updatedAt: Date.now() }, { merge: true });
}

const person = (d) => ({ uid: d.uid, name: d.name, avatar: d.avatar ?? "⚽", theme: d.theme ?? "lime", level: d.level ?? 1, tag: d.tag ?? tagOf(d.uid) });

async function meta(store, uid) {
  return (await store.get(`chatmeta/${uid}`)) ?? { v: 0, unread: 0, blocked: {} };
}

/**
 * Finds people by what you type, matched against their display name (the start of it or any
 * word's start) and their email (the start of it, or all of it). Results show a name, never an email.
 */
export async function searchPeople(identity, q) {
  rateLimit(`chats:${identity.uid}`, 40);
  await syncDirectory(identity);
  const raw = String(q ?? "").trim().toLowerCase().replace(/^@/, "");
  const [termPart, tagPart] = raw.split("#");
  const term = termPart.trim();
  const tagOnly = /^\d{4}$/.test(tagPart ?? "");
  if (term.length < 2 && !tagOnly) return { people: [] };
  const store = await getStore();
  const words = term.split(/\s+/).filter(Boolean);
  const prefix = (field, text) => store.list("dir", { where: [[field, ">=", text], [field, "<", `${text}\uf8ff`]], limit: 30 });

  const jobs = [];
  if (term.length >= 2) {
    jobs.push(prefix("nameLower", term).then((rows) => rows.map((r) => ({ r, via: "name" }))));
    const last = words.at(-1);
    if (last.length >= 2) jobs.push(prefix("lastWord", last).then((rows) => rows.map((r) => ({ r, via: "name" }))));
    if (term.length >= 3 && !term.includes(" ")) jobs.push(prefix("emailLower", term).then((rows) => rows.map((r) => ({ r, via: "email" }))));
  }
  const found = new Map();
  for (const { r, via } of (await Promise.all(jobs)).flat()) if (!found.has(r.uid) || via === "name") found.set(r.uid, { r, via });

  const mine = await meta(store, identity.uid);
  const score = ({ r, via }) => (r.nameLower === term ? 0 : r.nameLower.startsWith(term) ? 1 : via === "name" ? 2 : 3);
  const people = [...found.values()]
    .filter(({ r }) => {
      if (r.uid === identity.uid || mine.blocked?.[r.uid]) return false;
      if (tagPart && (r.tag ?? tagOf(r.uid)) !== tagPart) return false;
      // every word typed must appear at the start of a word in the name (or in the email's name part)
      const hay = `${r.nameLower} ${(r.emailLower ?? "").split("@")[0]}`.split(/[^\p{L}\p{N}]+/u);
      return words.every((w) => hay.some((h) => h.startsWith(w)) || (r.emailLower ?? "").startsWith(w));
    })
    .sort((a, b) => score(a) - score(b) || a.r.name.localeCompare(b.r.name))
    .slice(0, 12)
    .map(({ r, via }) => ({ ...person(r), via }));
  return { people };
}

/* ---------- reading ---------- */

const view = (m) => ({ id: m.id, from: m.from, at: m.at, upd: m.upd, type: m.type, stale: Boolean(m.stale), text: m.deleted ? "" : m.text ?? "", invite: m.deleted ? null : m.invite ?? null, game: m.deleted ? null : m.game ?? null, reactions: m.deleted ? {} : m.reactions ?? {}, deleted: Boolean(m.deleted) });

async function requireChat(store, identity, chatId) {
  const chat = await store.get(`chats/${chatId}`);
  if (!chat || !chat.memberIds?.includes(identity.uid)) throw new GameError("That conversation wasn't found.", 404);
  return chat;
}

async function inboxList(store, uid) {
  const rows = await store.list(`inbox_${uid}`, { orderBy: "lastAt", desc: true, limit: 40 });
  return rows.map((r) => ({ chat: r.id, peer: r.peer, last: r.last, lastAt: r.lastAt, unread: r.unread ?? 0 }));
}

/** Marks everything in a conversation as read (for me) and tells the other person. */
async function markRead(store, uid, chatId, unread) {
  const ops = [store.set(`chats/${chatId}`, { [`readAt.${uid}`]: Date.now() }, { merge: true })];
  if (unread > 0) {
    ops.push(store.set(`inbox_${uid}/${chatId}`, { unread: 0 }, { merge: true }));
    ops.push(store.set(`chatmeta/${uid}`, { unread: inc(-unread), v: inc(1) }, { merge: true }));
  }
  await Promise.all(ops);
}

export async function openChat(identity, peerUid) {
  rateLimit(`chato:${identity.uid}`, 60);
  const store = await getStore();
  if (peerUid === identity.uid) throw new GameError("You can't message yourself.");
  const peerDoc = await store.get(`dir/${peerUid}`);
  if (!peerDoc) throw new GameError("That player wasn't found.", 404);
  const chatId = chatIdOf(identity.uid, peerUid);
  const [chat, messages, inbox, mine] = await Promise.all([
    store.get(`chats/${chatId}`),
    store.list(`chatmsg_${chatId}`, { orderBy: "at", desc: true, limit: 40 }),
    store.get(`inbox_${identity.uid}/${chatId}`),
    meta(store, identity.uid),
  ]);
  if (chat) await markRead(store, identity.uid, chatId, inbox?.unread ?? 0);
  const upd = messages.reduce((n, m) => Math.max(n, m.upd ?? m.at), 0);
  return {
    chat: chatId,
    peer: person(peerDoc),
    messages: messages.reverse().map(view),
    since: upd,
    readAt: chat?.readAt?.[peerUid] ?? 0,
    blocked: Boolean(mine.blocked?.[peerUid]),
    now: Date.now(),
  };
}

/** One poll: the change counter and unread total, plus the conversation list and open thread when they changed. */
export async function syncChat(identity, { v = -1, chat: chatId = null, since = 0, typing = false } = {}) {
  rateLimit(`chatsync:${identity.uid}`, 120);
  const store = await getStore();
  const mine = await meta(store, identity.uid);
  const out = { now: Date.now(), v: mine.v ?? 0, unread: Math.max(0, mine.unread ?? 0) };
  const jobs = [];
  if (v !== out.v) jobs.push(inboxList(store, identity.uid).then((list) => (out.inbox = list)));
  if (chatId) {
    jobs.push(
      (async () => {
        const chat = await requireChat(store, identity, chatId);
        const peerUid = chat.memberIds.find((u) => u !== identity.uid);
        if (typing) await store.set(`chats/${chatId}`, { [`typing.${identity.uid}`]: Date.now() }, { merge: true });
        const rows = await store.list(`chatmsg_${chatId}`, { where: [["upd", ">", since]], orderBy: "upd", limit: 100 });
        out.thread = {
          chat: chatId,
          messages: rows.map(view),
          readAt: chat.readAt?.[peerUid] ?? 0,
          typing: Date.now() - (chat.typing?.[peerUid] ?? 0) < TYPING_MS,
        };
        // The thread is open, so what just arrived is read.
        if (rows.some((m) => m.from !== identity.uid)) {
          const inbox = await store.get(`inbox_${identity.uid}/${chatId}`);
          const n = inbox?.unread ?? 0;
          await markRead(store, identity.uid, chatId, n);
          out.unread = Math.max(0, out.unread - n); // the counter we read a moment ago is one step behind
        }
      })(),
    );
  }
  await Promise.all(jobs);
  return out;
}

/* ---------- writing ---------- */

async function deliver(store, identity, chatId, peerUid, msg, preview) {
  const me = await store.get(`dir/${identity.uid}`);
  const peer = await store.get(`dir/${peerUid}`);
  const now = msg.at;
  const last = { text: preview, at: now, from: identity.uid, type: msg.type };
  await Promise.all([
    store.set(`chatmsg_${chatId}/${msg.id}`, msg),
    store.set(`chats/${chatId}`, { id: chatId, memberIds: [identity.uid, peerUid], last, [`readAt.${identity.uid}`]: now, [`typing.${identity.uid}`]: 0 }, { merge: true }),
    store.set(`inbox_${identity.uid}/${chatId}`, { chatId, peer: person(peer), last, lastAt: now, unread: 0 }, { merge: true }),
    store.set(`inbox_${peerUid}/${chatId}`, { chatId, peer: person(me), last, lastAt: now, unread: inc(1) }, { merge: true }),
    store.set(`chatmeta/${peerUid}`, { v: inc(1), unread: inc(1) }, { merge: true }),
  ]);
}

async function resolvePeer(store, identity, { peer, chat }) {
  let peerUid = peer;
  if (!peerUid && chat) peerUid = (await requireChat(store, identity, chat)).memberIds.find((u) => u !== identity.uid);
  if (!peerUid || peerUid === identity.uid) throw new GameError("Pick someone to message.");
  const [peerDoc, theirs, mine] = await Promise.all([store.get(`dir/${peerUid}`), meta(store, peerUid), meta(store, identity.uid)]);
  if (!peerDoc) throw new GameError("That player wasn't found.", 404);
  if (mine.blocked?.[peerUid]) throw new GameError("You blocked this person. Unblock them to send messages.");
  if (theirs.blocked?.[identity.uid]) throw new GameError("You can't message this person.", 403);
  return peerUid;
}

// Always moving forward, even for two messages in the same millisecond, so the order never flips.
let lastStamp = 0;
const stamp = () => (lastStamp = Math.max(Date.now(), lastStamp + 1));
const newMessageId = (at) => `${at.toString(36).padStart(9, "0")}${newId(4)}`;

export async function sendMessage(identity, body) {
  rateLimit(`chatsend:${identity.uid}`, 40);
  const store = await getStore();
  await syncDirectory(identity);
  const peerUid = await resolvePeer(store, identity, body);
  const chatId = chatIdOf(identity.uid, peerUid);
  const now = stamp();
  const msg = { id: newMessageId(now), from: identity.uid, at: now, upd: now, type: "text", text: "" };
  let preview;

  if (body.kind === "invite") {
    const code = String(body.code ?? "").toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new GameError("That isn't a battle code.");
    const room = await store.get(`rooms/${code}`);
    if (!room || !room.memberIds?.includes(identity.uid)) throw new GameError("That battle room wasn't found.", 404);
    msg.type = "invite";
    msg.invite = { code, title: room.title ?? "Football quiz", kind: room.kind ?? "quiz" };
    preview = `Battle invite · ${msg.invite.title}`;
  } else {
    msg.text = clean(body.text);
    if (!msg.text) throw new GameError("Type a message first.");
    preview = msg.text.slice(0, 80);
  }
  await deliver(store, identity, chatId, peerUid, msg, preview);
  return { chat: chatId, message: view(msg) };
}

/** Can this person message that one? (throws the reason if not) */
export async function canMessage(identity, peerUid) {
  const store = await getStore();
  await syncDirectory(identity);
  await resolvePeer(store, identity, { peer: peerUid });
}

const GAME_EMOJI = { swipe: "🔤", whot: "🃏", darts: "🎯" };

/**
 * Called by the chat-games module each time a turn is handed over: a new game bubble arrives at
 * the bottom of the conversation (like iMessage), and the previous one is marked as an older move.
 */
export async function postGame(identity, peerUid, game, previousMsgId = null) {
  const store = await getStore();
  await syncDirectory(identity);
  await resolvePeer(store, identity, { peer: peerUid });
  const chatId = chatIdOf(identity.uid, peerUid);
  const now = stamp();
  const msg = { id: newMessageId(now), from: identity.uid, at: now, upd: now, type: "game", text: "", game };
  const preview = `${GAME_EMOJI[game.type] ?? "🎮"} ${game.title}${game.status === "done" ? " · game over" : ""}`;
  await Promise.all([
    deliver(store, identity, chatId, peerUid, msg, preview),
    previousMsgId ? store.update(`chatmsg_${chatId}/${previousMsgId}`, { stale: true, upd: now }).catch(() => {}) : null,
  ]);
  return { chat: chatId, message: view(msg), msgId: msg.id };
}

/** A game changed (a move was made): refresh its card in the conversation so both sides see it. */
export async function touchGame(chatId, msgId, patch) {
  const store = await getStore();
  await store.update(`chatmsg_${chatId}/${msgId}`, { upd: stamp(), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [`game.${k}`, v])) });
}

export async function reactTo(identity, chatId, msgId, emoji) {
  rateLimit(`chatreact:${identity.uid}`, 60);
  if (!REACTIONS.includes(emoji)) throw new GameError("That reaction isn't available.");
  const store = await getStore();
  await requireChat(store, identity, chatId);
  const path = `chatmsg_${chatId}/${msgId}`;
  const m = await store.get(path);
  if (!m || m.deleted) throw new GameError("That message was not found.", 404);
  const same = m.reactions?.[identity.uid] === emoji;
  await store.update(path, { [`reactions.${identity.uid}`]: same ? remove() : emoji, upd: stamp() });
  return { ok: true };
}

export async function unsendMessage(identity, chatId, msgId) {
  rateLimit(`chatunsend:${identity.uid}`, 30);
  const store = await getStore();
  await requireChat(store, identity, chatId);
  const path = `chatmsg_${chatId}/${msgId}`;
  const m = await store.get(path);
  if (!m || m.from !== identity.uid) throw new GameError("You can only unsend your own messages.", 403);
  await store.update(path, { deleted: true, text: "", invite: null, upd: stamp() });
  return { ok: true };
}

export async function blockPerson(identity, peerUid, blocked) {
  rateLimit(`chatblock:${identity.uid}`, 20);
  const store = await getStore();
  if (!peerUid || peerUid === identity.uid) throw new GameError("Pick someone.");
  await store.set(`chatmeta/${identity.uid}`, { [`blocked.${peerUid}`]: blocked ? true : remove(), v: inc(1) }, { merge: true });
  return { blocked: Boolean(blocked) };
}

export async function reportPerson(identity, chatId, reason) {
  rateLimit(`chatreport:${identity.uid}`, 5);
  const store = await getStore();
  const chat = await requireChat(store, identity, chatId);
  const about = chat.memberIds.find((u) => u !== identity.uid);
  const recent = await store.list(`chatmsg_${chatId}`, { orderBy: "at", desc: true, limit: 10 });
  await store.set(`chat_reports/${newId(12)}`, { by: identity.uid, about, chat: chatId, reason: clean(reason).slice(0, 300), at: Date.now(), recent: recent.filter((m) => m.from === about).map((m) => ({ id: m.id, text: m.text ?? "" })).slice(0, 5) });
  return { ok: true };
}

export { chatIdOf };

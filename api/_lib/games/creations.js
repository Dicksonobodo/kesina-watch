import { getStore } from "./store.js";
import { GameError, newId, rateLimit } from "./util.js";

/*
 * Things people make for their own real-life football: tournaments (league, Champions League
 * style, World Cup style, knockout cup) and line-ups. Each belongs to the person who made it;
 * anyone signed in who has the link can look at it (that is how a tournament is shared), but
 * only the owner can change or delete it. The browser does the football maths; the server
 * stores the document and checks who may write it.
 *
 * The data is stored as one JSON string: Firestore refuses lists inside lists (a tournament's
 * groups are exactly that), so its shape is never left to Firestore.
 */

const KINDS = new Set(["tourney", "lineup"]);
const MAX_BYTES = 150_000;
const clean = (text, max) => String(text ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);

const summary = (c) => ({ id: c.id, kind: c.kind, name: c.name, updatedAt: c.updatedAt, createdAt: c.createdAt, info: c.info ?? null });

export async function listCreations(identity, kind) {
  if (!KINDS.has(kind)) throw new GameError("Unknown kind.");
  const store = await getStore();
  // One equality filter (no extra index needed); newest first is sorted here.
  const rows = await store.list("creations", { where: [["owner", "==", identity.uid]], limit: 300 });
  return { items: rows.filter((r) => r.kind === kind).sort((a, b) => b.updatedAt - a.updatedAt).map(summary) };
}

export async function getCreation(identity, id) {
  const store = await getStore();
  const c = await store.get(`creations/${String(id ?? "").slice(0, 40)}`);
  if (!c) throw new GameError("That wasn't found. It may have been deleted.", 404);
  const data = c.dataJson ? JSON.parse(c.dataJson) : c.data ?? null;
  return { ...summary(c), data, owner: c.owner, ownerName: c.ownerName ?? null, mine: c.owner === identity.uid };
}

export async function saveCreation(identity, body) {
  rateLimit(`create:${identity.uid}`, 90);
  const kind = String(body.kind ?? "");
  if (!KINDS.has(kind)) throw new GameError("Unknown kind.");
  const name = clean(body.name, 60);
  if (name.length < 2) throw new GameError("Give it a name.");
  if (!body.data || typeof body.data !== "object") throw new GameError("Nothing to save.");
  const json = JSON.stringify(body.data);
  if (json.length > MAX_BYTES) throw new GameError("That's too big to save.");
  const store = await getStore();
  const now = Date.now();
  let id = body.id ? String(body.id).slice(0, 40) : null;
  if (id) {
    const existing = await store.get(`creations/${id}`);
    if (!existing) throw new GameError("That wasn't found.", 404);
    if (existing.owner !== identity.uid) throw new GameError("Only the person who made this can change it.", 403);
    const { data: _old, ...rest } = existing;
    await store.set(`creations/${id}`, { ...rest, name, dataJson: json, info: clean(body.info, 80) || null, updatedAt: now });
  } else {
    const mine = await store.count("creations", [["owner", "==", identity.uid]]);
    if (mine >= 200) throw new GameError("You've reached 200 saved items. Delete some first.");
    id = newId(10);
    await store.set(`creations/${id}`, { id, kind, owner: identity.uid, ownerName: clean(identity.name, 40), name, dataJson: json, info: clean(body.info, 80) || null, createdAt: now, updatedAt: now });
  }
  return { id, updatedAt: now };
}

export async function deleteCreation(identity, id) {
  const store = await getStore();
  const path = `creations/${String(id ?? "").slice(0, 40)}`;
  const c = await store.get(path);
  if (!c) return { ok: true };
  if (c.owner !== identity.uid) throw new GameError("Only the person who made this can delete it.", 403);
  await store.delete(path);
  return { ok: true };
}

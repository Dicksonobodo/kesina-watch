import { getStore, writeVersion } from "./store.js";
import { GameError, memo, newId } from "./util.js";

/*
 * Lives pinned by an admin for everyone: they show on every user's Live page with a label
 * ("Match", "Concert", …) so people know what is on before they tap.
 */

const COLLECTION = "featured_live";
const clean = (text, max) => String(text ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);

export async function listFeatured() {
  const rows = await memo("featured_live", 15_000, writeVersion(), async () => {
    const store = await getStore();
    return store.list(COLLECTION, { orderBy: "at", desc: true, limit: 30 });
  });
  return { featured: rows.map((r) => ({ id: r.id, url: r.url, title: r.title, label: r.label, at: r.at })) };
}

export async function addFeatured(identity, body) {
  if (!identity.admin) throw new GameError("Admins only.", 403);
  const url = clean(body.url, 800);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new GameError("That doesn't look like a link.");
  }
  if (!/^https?:$/.test(parsed.protocol)) throw new GameError("Use an http(s) link.");
  const title = clean(body.title, 60);
  const label = clean(body.label, 24);
  if (title.length < 2) throw new GameError("Give it a title, like \"Arsenal vs Chelsea\".");
  if (label.length < 2) throw new GameError("Add a label, like Match or Concert.");
  const store = await getStore();
  const id = newId(10);
  await store.set(`${COLLECTION}/${id}`, { url: parsed.toString(), title, label, at: Date.now(), by: identity.uid });
  return listFeatured();
}

export async function removeFeatured(identity, id) {
  if (!identity.admin) throw new GameError("Admins only.", 403);
  const store = await getStore();
  await store.delete(`${COLLECTION}/${String(id ?? "").slice(0, 40)}`);
  return listFeatured();
}

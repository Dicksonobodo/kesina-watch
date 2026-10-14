import { readFileSync } from "node:fs";

/*
 * One small storage interface for the games, with two backends:
 *  - Firestore (firebase-admin) when FIREBASE_SERVICE_ACCOUNT is set: production.
 *  - In memory otherwise: local development and tests (nothing survives a restart).
 *
 * Paths are "collection/doc" (or deeper). Updates accept dotted field paths ("members.abc.pts")
 * and two markers: inc(n) adds to a number, remove() deletes a field.
 */

/*
 * Every write bumps a counter. Short-lived caches (leaderboards, the admin numbers) include it in
 * their key, so what you just did shows up straight away instead of after a timeout.
 */
let writes = 0;
export const writeVersion = () => writes;
const wrote = () => {
  writes++;
};

const INC = "__inc";
const DEL = "__delete";
export const inc = (n = 1) => ({ [INC]: n });
export const remove = () => ({ [DEL]: true });
const isMarker = (v, k) => v && typeof v === "object" && k in v;

/* ---------- in-memory backend ---------- */

function memoryBackend() {
  const docs = new Map(); // path → data

  // Local development only: keep the data in a file so it survives restarts (GAMES_DEV_FILE).
  const file = process.env.VERCEL ? null : process.env.GAMES_DEV_FILE || null;
  let saveTimer = null;
  const persist = () => {
    wrote();
    if (!file) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify([...docs.entries()]));
      } catch {
        /* a failed save only loses restart persistence */
      }
    }, 300);
  };
  if (file) {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      for (const [k, v] of saved) docs.set(k, v);
    } catch {
      /* no saved data yet */
    }
  }

  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const setDeep = (obj, dotted, value) => {
    const parts = dotted.split(".");
    let o = obj;
    for (const p of parts.slice(0, -1)) {
      if (typeof o[p] !== "object" || o[p] === null) o[p] = {};
      o = o[p];
    }
    const last = parts[parts.length - 1];
    if (isMarker(value, DEL)) delete o[last];
    else if (isMarker(value, INC)) o[last] = (Number(o[last]) || 0) + value[INC];
    else o[last] = clone(value);
  };
  const getDeep = (obj, dotted) => dotted.split(".").reduce((o, p) => (o == null ? undefined : o[p]), obj);

  return {
    kind: "memory",
    async get(path) {
      return clone(docs.get(path)) ?? null;
    },
    async set(path, data, { merge = false } = {}) {
      const base = merge ? docs.get(path) ?? {} : {};
      const next = clone(base);
      for (const [k, v] of Object.entries(data)) setDeep(next, k, v);
      docs.set(path, next);
      persist();
    },
    async update(path, patch) {
      const cur = docs.get(path);
      if (!cur) throw new Error(`no such document: ${path}`);
      const next = clone(cur);
      for (const [k, v] of Object.entries(patch)) setDeep(next, k, v);
      docs.set(path, next);
      persist();
    },
    async delete(path) {
      docs.delete(path);
      persist();
    },
    async count(collection, where = []) {
      return (await this.list(collection, { where, limit: 1_000_000 })).length;
    },
    // Compare-and-set: applies `patch` only if every field in `expected` still has that value.
    async cas(path, expected, patch) {
      const cur = docs.get(path);
      if (!cur || Object.entries(expected).some(([k, v]) => getDeep(cur, k) !== v)) return false;
      const next = clone(cur);
      for (const [k, v] of Object.entries(patch)) setDeep(next, k, v);
      docs.set(path, next);
      persist();
      return true;
    },
    async list(collection, { where = [], orderBy, desc = false, limit = 100 } = {}) {
      const prefix = `${collection}/`;
      let rows = [...docs.entries()]
        .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
        .map(([p, data]) => ({ id: p.slice(prefix.length), ...clone(data) }));
      for (const [field, op, value] of where) {
        rows = rows.filter((r) => {
          const v = getDeep(r, field);
          if (op === "==") return v === value;
          if (op === "!=") return v !== value;
          if (op === "<") return v < value;
          if (op === "<=") return v <= value;
          if (op === ">") return v > value;
          if (op === ">=") return v >= value;
          if (op === "array-contains") return Array.isArray(v) && v.includes(value);
          return false;
        });
      }
      if (orderBy) rows.sort((a, b) => (desc ? -1 : 1) * ((getDeep(a, orderBy) ?? 0) > (getDeep(b, orderBy) ?? 0) ? 1 : -1));
      return rows.slice(0, limit);
    },
    _docs: docs,
  };
}

/* ---------- Firestore backend ---------- */

async function firestoreBackend() {
  const { adminApp } = await import("./admin.js");
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
  const app = adminApp();
  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true }); // must run before the first read or write
  } catch {
    /* already configured on a warm instance */
  }

  const convert = (patch) =>
    Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, isMarker(v, INC) ? FieldValue.increment(v[INC]) : isMarker(v, DEL) ? FieldValue.delete() : v]),
    );
  const ref = (path) => db.doc(path);

  return {
    kind: "firestore",
    async get(path) {
      const snap = await ref(path).get();
      return snap.exists ? snap.data() : null;
    },
    async set(path, data, { merge = false } = {}) {
      // set() with merge treats dotted keys literally, so route those through update().
      wrote();
      if (merge && Object.keys(data).some((k) => k.includes("."))) {
        if (!(await ref(path).get()).exists) await ref(path).set({});
        return ref(path).update(convert(data));
      }
      return ref(path).set(convert(data), { merge });
    },
    async update(path, patch) {
      wrote();
      return ref(path).update(convert(patch));
    },
    async delete(path) {
      wrote();
      return ref(path).delete();
    },
    // Counts without reading the documents (one cheap aggregate read per 1000 matches).
    async count(collection, where = []) {
      let q = db.collection(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      return (await q.count().get()).data().count;
    },
    async cas(path, expected, patch) {
      const done = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(path));
        if (!snap.exists) return false;
        const data = snap.data();
        if (Object.entries(expected).some(([k, v]) => data[k] !== v)) return false;
        tx.update(ref(path), convert(patch));
        return true;
      });
      if (done) wrote();
      return done;
    },
    async list(collection, { where = [], orderBy, desc = false, limit = 100 } = {}) {
      let q = db.collection(collection);
      for (const [field, op, value] of where) q = q.where(field, op, value);
      if (orderBy) q = q.orderBy(orderBy, desc ? "desc" : "asc");
      const snap = await q.limit(limit).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  };
}

/* ---------- pick one ---------- */

let backend;
export function getStore() {
  backend ??= process.env.FIREBASE_SERVICE_ACCOUNT ? firestoreBackend() : Promise.resolve(memoryBackend());
  return backend;
}

/** For tests: a fresh in-memory store. */
export function useFreshMemoryStore() {
  backend = Promise.resolve(memoryBackend());
  return backend;
}

export const usesFirestore = () => Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);

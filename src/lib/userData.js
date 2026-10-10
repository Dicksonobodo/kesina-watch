import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { reportError } from "./monitoring";

/*
 * Per-user data under users/{uid}/…  (library, sites, stats).
 * Uses Firestore when Firebase is connected; otherwise (preview mode) the same API is
 * backed by localStorage so everything still works on this device.
 */

const MAX_DOCS = 300;

/* ---------- sync problems (e.g. Firestore rules not published) ---------- */

const problemListeners = new Set();
let currentProblem = null;

export function onSyncProblem(fn) {
  problemListeners.add(fn);
  fn(currentProblem);
  return () => problemListeners.delete(fn);
}

function report(err, where) {
  if (err?.code !== "permission-denied") reportError(err, { where: `data:${where}` });
  if (err?.code !== "permission-denied" || currentProblem) return;
  currentProblem = "permission-denied";
  problemListeners.forEach((fn) => fn(currentProblem));
}

const reported = (promise, where) =>
  promise.catch((err) => {
    report(err, where);
    throw err;
  });

// Firestore rejects undefined values.
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

export const toMillis = (v) => (typeof v === "number" ? v : v?.toMillis?.() ?? 0);

/* ---------- localStorage fallback ---------- */

const listeners = new Map();
const localKey = (uid, name) => `dw:${uid}:${name}`;

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? {};
  } catch {
    return {};
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
  (listeners.get(key) ?? []).forEach((fn) => fn(value));
}

function listenLocal(key, fn) {
  const set = listeners.get(key) ?? new Set();
  set.add(fn);
  listeners.set(key, set);
  fn(readLocal(key));
  return () => set.delete(fn);
}

/* ---------- collections ---------- */

export function watchCollection(uid, name, onChange) {
  if (!db) {
    return listenLocal(localKey(uid, name), (all) =>
      onChange(
        Object.entries(all)
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt)),
      ),
    );
  }
  const q = query(collection(db, "users", uid, name), orderBy("updatedAt", "desc"), limit(MAX_DOCS));
  return onSnapshot(
    q,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))),
    (err) => report(err, name),
  );
}

export function putItem(uid, name, id, data) {
  const payload = clean(data);
  if (!db) {
    const key = localKey(uid, name);
    const all = readLocal(key);
    all[id] = { ...all[id], ...payload, updatedAt: Date.now() };
    writeLocal(key, all);
    return Promise.resolve();
  }
  return reported(setDoc(doc(db, "users", uid, name, id), { ...payload, updatedAt: serverTimestamp() }, { merge: true }), name);
}

/** One document, read once (null when missing or on error). */
export async function readItem(uid, name, id) {
  if (!db) return readLocal(localKey(uid, name))[id] ?? null;
  try {
    const snap = await getDoc(doc(db, "users", uid, name, id));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    report(err, name);
    return null;
  }
}

export function removeItem(uid, name, id) {
  if (!db) {
    const key = localKey(uid, name);
    const all = readLocal(key);
    delete all[id];
    writeLocal(key, all);
    return Promise.resolve();
  }
  return reported(deleteDoc(doc(db, "users", uid, name, id)), name);
}

/* ---------- single documents (stats) ---------- */

export function watchDoc(uid, name, id, onChange) {
  if (!db) return listenLocal(localKey(uid, `${name}/${id}`), onChange);
  return onSnapshot(
    doc(db, "users", uid, name, id),
    (snap) => onChange(snap.data() ?? {}),
    (err) => report(err, `${name}/${id}`),
  );
}

export function incrementDoc(uid, name, id, fields) {
  if (!db) {
    const key = localKey(uid, `${name}/${id}`);
    const current = readLocal(key);
    for (const [k, n] of Object.entries(fields)) current[k] = (current[k] ?? 0) + n;
    writeLocal(key, current);
    return Promise.resolve();
  }
  const update = Object.fromEntries(Object.entries(fields).map(([k, n]) => [k, increment(n)]));
  return reported(setDoc(doc(db, "users", uid, name, id), { ...update, updatedAt: serverTimestamp() }, { merge: true }), `${name}/${id}`);
}

/* ---------- React hook ---------- */

export function useUserCollection(uid, name) {
  const [state, setState] = useState({ items: [], loading: true });
  useEffect(() => {
    if (!uid) return;
    return watchCollection(uid, name, (items) => setState({ items, loading: false }));
  }, [uid, name]);
  return state;
}

/* ---------- helpers ---------- */

// Stable id from a URL, so saving / pinning the same page twice updates one document.
export function idFromUrl(prefix, url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return `${prefix}_${h.toString(36)}`;
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "This device";
}

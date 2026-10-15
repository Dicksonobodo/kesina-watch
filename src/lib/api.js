import { auth } from "./firebase";
import { paletteFor } from "./palette";
import { reportError } from "./monitoring";
import { loadServerUrl, refreshServerUrl } from "./server";

const DETECT_TIMEOUT_MS = 90_000;
const OFFLINE = "Live is offline right now: the stream server isn't running. Try again a bit later.";

/** JSON request to the Dixon server, signed in when a user is. Throws Error(message) on failure. */
export async function api(path, { method = "GET", body, signal, auth: withAuth = true } = {}) {
  const base = await loadServerUrl();
  if (!base) throw new Error(OFFLINE);
  const token = withAuth ? await auth?.currentUser?.getIdToken() : null;
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ?? AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(navigator.onLine ? "Can't reach Dixon Watch right now." : "You're offline.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
  return data;
}

export async function detectMovie(url, { signal } = {}) {
  // The server's address can change when the laptop it runs on restarts: if there's none, or the
  // known one doesn't answer, ask for the latest once before giving up.
  let base = (await loadServerUrl()) || (await refreshServerUrl());
  if (!base) throw new Error(OFFLINE);

  const token = await auth?.currentUser?.getIdToken();
  // The server gives up at 75s; don't let the browser wait forever if the network stalls.
  const timeout = AbortSignal.timeout(DETECT_TIMEOUT_MS);
  const send = (to) =>
    fetch(`${to}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  let res;
  try {
    try {
      res = await send(base);
    } catch (err) {
      if (signal?.aborted || timeout.aborted) throw err;
      const fresh = await refreshServerUrl();
      if (!fresh) throw new Error(OFFLINE);
      if (fresh === base) throw err;
      base = fresh;
      res = await send(base);
    }
  } catch (err) {
    if (signal?.aborted) throw err; // the user started another detection
    if (timeout.aborted) throw new Error("That took too long. The page may be very slow; try again.");
    if (err.message === OFFLINE) throw err;
    throw new Error(navigator.onLine ? "Can't reach the Live server right now. Try again in a moment." : "You're offline. Check your connection.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status >= 500 && res.status !== 503 && res.status !== 504) {
      reportError(new Error(`detect ${res.status}: ${body.error || "no body"}`), { where: "detect", ref: body.ref, url });
    }
    const message = body.error || "We couldn't read that page. Try another link.";
    throw new Error(body.ref ? `${message} (ref ${body.ref})` : message);
  }
  const data = await res.json();
  return { ...data, palette: data.palette ?? paletteFor(data.title || url) };
}



import { auth } from "./firebase";
import { paletteFor } from "./palette";
import { reportError } from "./monitoring";

const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "");
const DETECT_TIMEOUT_MS = 90_000;

// Without VITE_API_URL, results are simulated so the UI can be explored.
export const isDemoApi = !API_URL;
export const apiUrl = API_URL;

/** JSON request to the Dixon server, signed in when a user is. Throws Error(message) on failure. */
export async function api(path, { method = "GET", body, signal, auth: withAuth = true } = {}) {
  if (!API_URL) throw new Error("The Dixon Watch server isn't configured.");
  const token = withAuth ? await auth?.currentUser?.getIdToken() : null;
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
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
  if (isDemoApi) return demoDetect();

  const token = await auth?.currentUser?.getIdToken();
  // The server gives up at 75s; don't let the browser wait forever if the network stalls.
  const timeout = AbortSignal.timeout(DETECT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}/detect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ url }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // the user started another detection
    if (timeout.aborted) throw new Error("That took too long. The page may be very slow; try again.");
    throw new Error(navigator.onLine ? "Can't reach Dixon Watch right now. Try again in a moment." : "You're offline. Check your connection.");
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

/* ---------- no server configured ---------- */

// Without a detection server nothing can be analyzed. This used to return simulated
// results with made-up qualities; an honest error is better than fake download buttons.
function demoDetect() {
  return Promise.reject(
    new Error("The video analysis server isn't connected, so links can't be analyzed right now. Set VITE_API_URL to the server's address."),
  );
}

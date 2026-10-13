import { auth } from "./firebase";

/*
 * Talks to the games function (/api/games). Sends the player's Firebase ID token; in local
 * preview mode (no Firebase keys) it sends a development token the function accepts only
 * when it isn't running on Vercel.
 */

async function token() {
  if (auth?.currentUser) return auth.currentUser.getIdToken();
  // Local preview: several "players" can be tried in different tabs by setting localStorage "dw-dev-user".
  let name = "preview";
  try {
    if (import.meta.env.DEV) name = localStorage.getItem("dw-dev-user") || name;
  } catch {
    /* storage blocked */
  }
  return `dev:${name}:${name === "preview" ? "Preview" : name}`;
}

export async function gamesApi(action, body = {}, { signal } = {}) {
  let res;
  try {
    res = await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ action, ...body }),
      signal: signal ?? AbortSignal.timeout(40_000),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new Error(navigator.onLine ? "Can't reach the games right now. Try again in a moment." : "You're offline.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status });
  return data;
}

export const THEME_COLORS = { lime: "#c6ff3d", sky: "#4cc9f0", rose: "#ff5d8f", gold: "#ffc53d", violet: "#a78bfa" };

import { auth } from "./firebase";
import { hostnameOf } from "./format";
import { hash, paletteFor } from "./palette";
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
  if (isDemoApi) return demoDetect(url, signal);

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

/* ---------- demo mode ---------- */

// "the-dark-knight-2008" → { title: "The Dark Knight", year: 2008 }
function titleFromUrl(url) {
  let slug = "";
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    slug = decodeURIComponent(parts.at(-1) ?? "").replace(/\.(html?|php|aspx?)$/i, "");
  } catch {
    /* ignore */
  }
  const yearMatch = slug.match(/(19|20)\d{2}/);
  const words = slug
    .replace(/(19|20)\d{2}.*$/, "")
    .split(/[-_+.\s]+/)
    .filter((w) => w && !/^\d+$/.test(w));
  const title = words.length
    ? words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ")
    : "Untitled Feature";
  return { title, year: yearMatch ? Number(yearMatch[0]) : 2024 };
}

function demoDetect(url, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const h = hash(url);
      const { title, year } = titleFromUrl(url);
      const runtime = 92 + (h % 60);
      const gb = 1.4 + (h % 15) / 10;
      resolve({
        demo: true,
        url,
        site: hostnameOf(url),
        title,
        year,
        runtime,
        poster: null,
        palette: paletteFor(url),
        adsBlocked: 18 + (h % 47),
        popupsBlocked: 2 + (h % 6),
        drm: false,
        sources: [
          { id: "1080", quality: "1080p", label: "Full HD", size: gb * 1024 ** 3, type: "file", container: "mp4" },
          { id: "720", quality: "720p", label: "HD", size: gb * 0.55 * 1024 ** 3, type: "file", container: "mp4" },
          { id: "480", quality: "480p", label: "SD", size: gb * 0.3 * 1024 ** 3, type: "file", container: "mp4" },
        ],
      });
    }, 4200);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

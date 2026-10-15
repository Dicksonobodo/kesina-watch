/*
 * Error tracking.
 * - Always: errors are sent to the Dixon server's /log endpoint, so they appear in the
 *   server log for free.
 * - Optional: set VITE_SENTRY_DSN (free Sentry plan) for a full dashboard with stack traces,
 *   browsers and counts. Sentry is only downloaded when a DSN is set.
 * Reports are de-duplicated and capped per visit so a loop can't flood anything.
 */

import { serverUrl } from "./server";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const RELEASE = import.meta.env.VITE_RELEASE || "dev";
const MAX_REPORTS = 15;

let sentry = null;
let userId = null;
let sent = 0;
const seen = new Set();

// Noise from browser extensions, aborted requests and ResizeObserver: not our bugs.
const IGNORE = [/ResizeObserver loop/i, /AbortError/i, /The user aborted/i, /chrome-extension:\/\//i, /moz-extension:\/\//i, /Load failed$/i];

export function initMonitoring() {
  window.addEventListener("error", (e) => {
    if (e.error || e.message) reportError(e.error || new Error(e.message), { where: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason, { where: "unhandledrejection" }));

  if (SENTRY_DSN) {
    import("@sentry/react")
      .then((Sentry) => {
        Sentry.init({
          dsn: SENTRY_DSN,
          release: RELEASE,
          environment: import.meta.env.MODE,
          sampleRate: 1,
          tracesSampleRate: 0,
          ignoreErrors: IGNORE,
        });
        sentry = Sentry;
        if (userId) Sentry.setUser({ id: userId });
      })
      .catch(() => {
        /* ad-blockers often block Sentry: the /log fallback still works */
      });
  }
}

export function setMonitoringUser(uid) {
  userId = uid || null;
  sentry?.setUser(uid ? { id: uid } : null);
}

/**
 * @param error  anything thrown
 * @param context { where: "player" | "download" | …, ...extra }
 */
export function reportError(error, context = {}) {
  const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : safeJson(error));
  const text = `${err.name}: ${err.message}`;
  if (IGNORE.some((re) => re.test(text) || re.test(err.stack || ""))) return;

  const { where, ...extra } = context;
  if (import.meta.env.DEV) console.error(`[report${where ? `:${where}` : ""}]`, err, extra);

  const key = `${where}|${text}`;
  if (seen.has(key) || sent >= MAX_REPORTS) return;
  seen.add(key);
  sent++;

  sentry?.captureException(err, { tags: { where }, extra });

  const API_URL = serverUrl();
  if (!API_URL) return;
  const body = JSON.stringify({
    message: text,
    stack: err.stack,
    where,
    page: location.pathname,
    release: RELEASE,
    uid: userId,
    extra,
  });
  try {
    if (!navigator.sendBeacon?.(`${API_URL}/log`, new Blob([body], { type: "text/plain" }))) {
      fetch(`${API_URL}/log`, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
    }
  } catch {
    /* never let reporting break the app */
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value)?.slice(0, 300) ?? String(value);
  } catch {
    return String(value);
  }
}

import { log } from "./log.js";
import { recordClientError } from "./activity.js";

/*
 * Receives error reports from visitors' browsers (sent with navigator.sendBeacon) and writes
 * them to the server log, so you can see what breaks for real users without a paid service.
 * Rate-limited per IP; anything malformed is dropped silently.
 */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const seen = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of seen) if (now - entry.start > WINDOW_MS) seen.delete(ip);
}, 60_000).unref();

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : undefined);

export function clientLogHandler(req, res) {
  res.status(204).end();

  const now = Date.now();
  const entry = seen.get(req.ip);
  if (!entry || now - entry.start > WINDOW_MS) seen.set(req.ip, { start: now, count: 1 });
  else if (++entry.count > MAX_PER_WINDOW) return;

  let body;
  try {
    body = JSON.parse(typeof req.body === "string" ? req.body : "");
  } catch {
    return;
  }
  if (!body || typeof body !== "object") return;

  recordClientError(str(body.message, 200) || "Unknown error");
  log.warn("client error", {
    message: str(body.message, 500),
    stack: str(body.stack, 2000),
    where: str(body.where, 100),
    page: str(body.page, 300),
    release: str(body.release, 40),
    browser: str(req.headers["user-agent"], 200),
    uid: str(body.uid, 64),
    extra: body.extra && typeof body.extra === "object" ? JSON.stringify(body.extra).slice(0, 500) : undefined,
  });
}

import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import { config, isAllowedOrigin } from "./config.js";
import { isAdmin, requireAdmin, requireUser } from "./auth.js";
import { rateLimit } from "./limits.js";
import { findChrome } from "./chrome.js";
import { log } from "./log.js";
import { detect, detectStats } from "./detect/index.js";
import { closeBrowser } from "./detect/browser.js";
import { getBlocker } from "./detect/blocker.js";
import { relayHandler, relayMirrorHandler, relayStats, signRelayToken } from "./relay.js";
import { clientLogHandler } from "./clientLog.js";
import { HttpError } from "./safety.js";
import { recordDetection, recordPresence, snapshot } from "./activity.js";
import { billingConfig, startCheckout, verifyCheckout, webhookHandler } from "./billing.js";

const app = express();
app.disable("x-powered-by");
if (config.trustProxy) app.set("trust proxy", true);

// Request id + baseline security headers on everything.
app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.id);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.use(
  cors({
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
    // The download engine reads these to track progress and resume.
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type", "X-Request-Id"],
    maxAge: 86400,
  }),
);

// Paystack signs the raw body, so this route must run before the JSON parser.
app.post("/billing/paystack/webhook", express.raw({ type: "*/*", limit: "64kb" }), webhookHandler);
app.use(express.json({ limit: "16kb" }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).then((body) => body !== undefined && res.json(body)).catch(next);

const startedAt = Date.now();
function health() {
  return {
    ok: true,
    chrome: Boolean(findChrome()),
    auth: config.requireAuth,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    detect: detectStats(),
    relay: relayStats(),
  };
}
app.get("/health", (_req, res) => res.json(health()));

/* ---------- account ---------- */

app.get("/me", requireUser, (req, res) => {
  res.json({ uid: req.uid, admin: isAdmin(req), premium: Boolean(req.premium), billing: billingConfig() });
});

// Each open tab checks in every 30s with what it's doing (for the admin's live view).
app.post("/presence", requireUser, (req, res) => {
  recordPresence({ uid: req.uid, email: req.email, name: req.name, premium: req.premium }, req.body ?? {});
  res.status(204).end();
});

/* ---------- detection ---------- */

app.post("/detect", requireUser, rateLimit, async (req, res, next) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!url) return res.status(400).json({ error: "Paste a movie page link first." });
  if (url.length > 2048) return res.status(400).json({ error: "That link is too long." });
  const user = { email: req.email, name: req.name };
  try {
    const result = await detect(url);
    log.info("detect", {
      id: req.id,
      engine: result.engine,
      ms: result.tookMs ?? 0,
      sources: result.sources.length,
      reason: result.reason ?? undefined,
      cached: Boolean(result.cached),
      url, // logged without its query string (see log.js)
    });
    recordDetection({ ok: result.sources.some((s) => s.downloadable || s.live), title: result.title, url, ms: result.tookMs, user });
    // Tokens are per user, so they are added after the (shared) cache.
    const token = (referer) => signRelayToken({ uid: req.uid, referer, premium: req.premium });
    res.json({
      ...result,
      sources: result.sources.map((s) => ({ ...s, relayToken: token(s.referer) })),
      subtitles: (result.subtitles ?? []).map((s) => ({ ...s, relayToken: token(s.referer) })),
    });
  } catch (err) {
    recordDetection({ ok: false, url, user });
    err.context = { url };
    next(err);
  }
});

// Streams a video file or stream piece for sources that block the browser (see relay.js).
app.get("/relay", relayHandler);
app.get(/^\/relay\/m\//, relayMirrorHandler); // mirror form for DASH players

/* ---------- premium ---------- */

app.get("/billing/config", (_req, res) => res.json(billingConfig()));
app.post("/billing/checkout", requireUser, wrap(startCheckout));
app.get("/billing/verify", requireUser, wrap(verifyCheckout));

/* ---------- admin: live dashboard stream ---------- */

app.get("/admin/stream", requireAdmin, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = () => res.write(`data: ${JSON.stringify(snapshot({ server: health() }))}\n\n`);
  send();
  const timer = setInterval(send, 3000);
  req.on("close", () => clearInterval(timer));
});

// Errors reported by visitors' browsers (see src/lib/monitoring.js in the website).
app.post("/log", express.text({ type: "*/*", limit: "16kb" }), clientLogHandler);

app.use((req, res) => res.status(404).json({ error: "Not found." }));

// One place for every error: known ones (HttpError) keep their message, unexpected ones are
// logged in full and answered with a generic message plus a reference id.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) log.error("request failed", { id: req.id, path: req.path, status, ...err.context, error: err });
  if (res.headersSent) return res.destroy();
  res.status(status).json({
    // Only our own HttpErrors carry user-facing text; library errors (body parser etc.) stay generic.
    error: err instanceof HttpError ? err.message : status < 500 ? "Bad request." : "Something went wrong on our side.",
    ref: status >= 500 ? req.id : undefined,
  });
});

const server = app.listen(config.port, () => {
  log.info("server started", {
    port: config.port,
    chrome: findChrome() || "NOT FOUND (set CHROME_PATH)",
    auth: config.requireAuth,
    admins: config.adminEmails.length,
    billing: billingConfig().enabled,
  });
  // Warm up the ad-block lists so the first detection is fast.
  getBlocker()
    .then(() => log.info("ad-block lists ready"))
    .catch((err) => log.warn("ad-block lists failed to load", { error: err }));
});
server.requestTimeout = 0; // long relay streams and the admin stream are fine; per-route timeouts handle the rest
server.keepAliveTimeout = 65_000;

// Never let one unexpected error take the whole server down.
process.on("unhandledRejection", (reason) => log.error("unhandled rejection", { error: reason }));
process.on("uncaughtException", (err) => log.error("uncaught exception", { error: err }));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    log.info("shutting down", { signal });
    server.close();
    await closeBrowser();
    process.exit(0);
  });
}

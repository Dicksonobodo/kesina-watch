import crypto from "node:crypto";
import { config } from "./config.js";
import { createSlots } from "./limits.js";
import { safeFetch } from "./net.js";
import { HttpError } from "./safety.js";

/*
 * The relay fetches a video file / stream piece on the user's behalf, for sources that
 * refuse to talk to the browser directly (no CORS, or they insist on a Referer).
 * Each detected source carries a signed token, so the relay can't be used as an open proxy:
 * tokens expire, are tied to a user, and only video-like responses are passed through.
 */

const SECRET = process.env.RELAY_SECRET || crypto.randomBytes(32).toString("hex");
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
// One person can't use up the server: a few parallel streams each, and an overall ceiling.
const slots = createSlots({ perUser: config.relayPerUser, total: config.relayTotal });

export const relayStats = () => slots.stats();

const b64url = (s) => Buffer.from(s).toString("base64url");
const sign = (payload) => crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

export function signRelayToken({ uid, referer, premium = false }) {
  const payload = b64url(JSON.stringify({ u: uid, r: referer, p: premium ? 1 : 0, e: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return claims.e > Date.now() ? claims : null;
  } catch {
    return null;
  }
}

// Pages, not media: stops the relay being used to browse arbitrary websites.
function looksLikeHtml(bytes) {
  const head = Buffer.from(bytes.subarray(0, 64)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.startsWith("<head") || head.startsWith("<body");
}

const MAX_PLAYLIST_BYTES = 5 * 1024 * 1024;

function isPlaylist(bytes) {
  return Buffer.from(bytes.subarray(0, 16)).toString("utf8").replace(/^﻿/, "").trimStart().startsWith("#EXTM3U");
}

export function rewritePlaylist(text, baseUrl, wrap) {
  const abs = (u) => wrap(new URL(u, baseUrl).href);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${abs(u)}"`);
      return abs(trimmed);
    })
    .join("\n");
}

const PASS_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "last-modified", "etag"];

/*
 * Mirror form, for DASH players: /relay/m/<token>/<scheme>/<host>/<path>?<query> mirrors the
 * real address, so relative segment addresses in a manifest (seg-1.m4s, ../video/x.m4s)
 * resolve back into the relay by themselves.
 */
const MIRROR_RE = /^\/relay\/m\/([^/]+)\/(https?)\/([^/]+)\/(.*)$/;
export function relayMirrorHandler(req, res) {
  const m = req.path.match(MIRROR_RE);
  if (!m) return res.status(400).json({ error: "Bad relay address." });
  const raw = req.originalUrl;
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?")) : "";
  req.relay = { token: m[1], target: `${m[2]}://${m[3]}/${m[4]}${query}` };
  return relayHandler(req, res);
}

export async function relayHandler(req, res) {
  const claims = verifyToken(req.relay?.token ?? req.query.t);
  if (!claims) return res.status(401).json({ error: "This download link expired. Analyze the link again." });

  const target = req.relay?.target ?? (typeof req.query.url === "string" ? req.query.url : "");
  if (!target || target.length > 4096) return res.status(400).json({ error: "Missing video address." });
  const release = slots(claims.u, claims.p ? config.relayPerUser * 2 : config.relayPerUser);
  if (!release) {
    res.setHeader("Retry-After", "2");
    return res.status(429).json({ error: "Too many streams at once. Close another download or player and try again." });
  }
  const controller = new AbortController();
  res.on("close", () => {
    release();
    if (!res.writableFinished) controller.abort();
  });

  try {
    // safeFetch refuses private addresses at connect time and re-checks every redirect hop,
    // so the relay can't be pointed at the server's own network.
    const upstream = await safeFetch(target, {
      headers: {
        ...(claims.r ? { Referer: claims.r, Origin: new URL(claims.r).origin } : {}),
        ...(req.headers.range ? { Range: req.headers.range } : {}),
        // Uncompressed, so byte counts and ranges match what the browser receives.
        "Accept-Encoding": "identity",
      },
      signal: controller.signal,
      timeoutMs: 0, // long movies are fine; a stalled source is cut off by the idle timeout
    });
    if (!upstream.ok) {
      upstream.body?.cancel().catch(() => {});
      // Pass expiry / not-found through so the download engine can explain it.
      const status = [401, 403, 404, 410].includes(upstream.status) ? upstream.status : 502;
      throw new HttpError(status, `The video source answered ${upstream.status}.`);
    }
    const total = Number(upstream.headers.get("content-range")?.split("/")[1]) || Number(upstream.headers.get("content-length")) || 0;
    if (total > config.maxDownloadBytes) {
      upstream.body?.cancel().catch(() => {});
      throw new HttpError(413, `This file is larger than the ${Math.round(config.maxDownloadBytes / 1024 ** 3)} GB limit.`);
    }

    const reader = upstream.body.getReader();
    const first = await reader.read();
    if (first.value && looksLikeHtml(first.value)) {
      reader.cancel().catch(() => {});
      throw new HttpError(415, "That link isn't a video.");
    }

    // Playlists for the player: point every piece / key / sub-playlist back through the relay.
    if (!req.relay && req.query.rw === "1" && first.value && isPlaylist(first.value)) {
      const parts = [first.value];
      let size = first.value.byteLength;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PLAYLIST_BYTES) throw new HttpError(413, "That playlist is too large.");
        parts.push(value);
      }
      const text = Buffer.concat(parts.map((p) => Buffer.from(p))).toString("utf8");
      // Behind a proxy, "trust proxy" makes req.protocol https; PUBLIC_URL wins if set.
      const publicBase = config.publicUrl || `${req.protocol}://${req.get("host")}`;
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(rewritePlaylist(text, upstream.url || target, (abs) => `${publicBase}/relay?${new URLSearchParams({ t: req.query.t, url: abs, rw: "1" })}`));
    }

    res.status(upstream.status);
    // The body arrives decompressed; a compressed Content-Length would cut it short.
    const encoded = Boolean(upstream.headers.get("content-encoding"));
    for (const name of PASS_HEADERS) {
      const value = upstream.headers.get(name);
      if (value && !(encoded && name === "content-length")) res.setHeader(name, value);
    }
    res.setHeader("Cache-Control", "no-store");
    if (!req.relay && typeof req.query.dl === "string" && req.query.dl) {
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(req.query.dl)}`);
    }

    if (first.value) await write(res, first.value);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await write(res, value);
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return; // the user paused or cancelled
    if (!res.headersSent) {
      res.status(err.status || 502).json({ error: err.status ? err.message : "Couldn't reach the video source." });
    } else {
      res.destroy();
    }
  }
}

// Respects backpressure so a slow phone doesn't make the server buffer the whole movie.
function write(res, chunk) {
  return new Promise((resolve, reject) => {
    if (res.destroyed) return reject(new Error("closed"));
    if (res.write(chunk)) resolve();
    else {
      res.once("drain", resolve);
      res.once("close", resolve);
    }
  });
}

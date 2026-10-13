/**
 * Helpers that look at a URL or the first bytes of a response and decide what it is:
 * an HLS playlist, a DASH manifest, a video file, a web page, or something else.
 */

const FILE_EXT_RE = /\.(mp4|m4v|webm|mov|mkv|ts)(\?|#|$)/i;

/** Best guess from the address and Content-Type alone (no download). */
export function classify(url, contentType = "") {
  const ct = String(contentType).toLowerCase();
  const path = safePath(url);
  if (ct.includes("mpegurl") || /\.m3u8$/i.test(path)) return "hls";
  if (ct.includes("dash+xml") || /\.mpd$/i.test(path)) return "dash";
  if (ct === "video/mp2t" || /\.(ts|m4s|m4a|aac)$/i.test(path)) return null; // stream pieces, not a source
  if (ct.startsWith("video/") || /\.(mp4|m4v|webm|mov|mkv)$/i.test(path)) return "file";
  return null;
}

function safePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

/**
 * What the first bytes of a body are. Returns { kind, container } where kind is
 * "hls" | "dash" | "file" | "html" | "data" | null.
 */
export function sniff(bytes, contentType = "") {
  const ct = String(contentType).toLowerCase();
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes ?? []);
  const text = buf.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  const lower = text.toLowerCase();

  if (text.startsWith("#EXTM3U")) return { kind: "hls" };
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<mpd[\s>]/i.test(text) || (ct.includes("dash+xml") && lower.includes("<mpd"))) return { kind: "dash" };
  if (lower.startsWith("<!doctype html") || lower.startsWith("<html") || lower.startsWith("<head") || lower.startsWith("<body") || ct.includes("text/html")) {
    return { kind: "html" };
  }
  if (buf.length >= 12 && buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    return { kind: "file", container: /qt {2}/.test(brand) ? "mov" : "mp4" };
  }
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) {
    return { kind: "file", container: lower.includes("webm") || ct.includes("webm") ? "webm" : "mkv" };
  }
  if (buf.length >= 189 && buf[0] === 0x47 && buf[188] === 0x47) return { kind: "file", container: "ts" };
  if (buf.length >= 8 && ["moov", "mdat", "free", "wide", "skip"].includes(buf.toString("latin1", 4, 8))) return { kind: "file", container: "mp4" };
  if (ct.startsWith("video/")) return { kind: "file", container: containerFromType(ct) };
  if (lower.startsWith("<?xml") || lower.startsWith("{") || lower.startsWith("[") || ct.includes("json") || ct.includes("xml") || ct.startsWith("text/")) {
    return { kind: "data" }; // an error message or API answer, not a video
  }
  return { kind: null };
}

function containerFromType(ct) {
  if (ct.includes("webm")) return "webm";
  if (ct.includes("matroska")) return "mkv";
  if (ct.includes("quicktime")) return "mov";
  if (ct.includes("mp2t")) return "ts";
  return "mp4";
}

export function containerFromUrl(url) {
  return safePath(url).match(FILE_EXT_RE)?.[1]?.toLowerCase().replace("m4v", "mp4") || null;
}

/**
 * Temporary (signed) media links carry their expiry in the address. Returns
 * { temporary, expiresAt } — expiresAt in ms when it can be read, else null.
 */
export function linkExpiry(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { temporary: false, expiresAt: null };
  }
  const q = new Map([...url.searchParams].map(([k, v]) => [k.toLowerCase(), v]));
  const asTime = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n > 1e12) return n; // already ms
    if (n > 1e9) return n * 1000; // unix seconds
    return null;
  };

  // AWS S3 / CloudFront-style v4 signatures: X-Amz-Date + X-Amz-Expires (seconds).
  if (q.has("x-amz-date") && q.has("x-amz-expires")) {
    const d = q.get("x-amz-date").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const start = d ? Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4], +d[5], +d[6]) : null;
    return { temporary: true, expiresAt: start ? start + Number(q.get("x-amz-expires")) * 1000 : null };
  }
  // Google Cloud Storage v4 signatures.
  if (q.has("x-goog-date") && q.has("x-goog-expires")) {
    const d = q.get("x-goog-date").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    const start = d ? Date.UTC(+d[1], +d[2] - 1, +d[3], +d[4], +d[5], +d[6]) : null;
    return { temporary: true, expiresAt: start ? start + Number(q.get("x-goog-expires")) * 1000 : null };
  }
  for (const key of ["expires", "expire", "expiry", "exp", "e", "deadline", "validto", "valid_to", "x-expires"]) {
    if (q.has(key)) {
      const at = asTime(q.get(key));
      if (at) return { temporary: true, expiresAt: at };
    }
  }
  // Akamai / generic tokens: hdnts=exp=…~acl=…, or a token / signature with no readable time.
  const hdnts = (q.get("hdnts") || q.get("__token__") || "").match(/exp=(\d+)/);
  if (hdnts) return { temporary: true, expiresAt: asTime(hdnts[1]) };
  const signed = ["signature", "sig", "token", "x-amz-signature", "policy", "key-pair-id", "hmac", "md5", "st"].some((k) => q.has(k));
  return { temporary: signed, expiresAt: null };
}

/** Maps an HTTP failure on a media link to a reason code. */
export function reasonForStatus(status) {
  if (status === 401 || status === 403) return "forbidden";
  if (status === 404 || status === 410) return "gone";
  if (status === 429) return "rate_limited";
  return "error";
}

import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
import { USER_AGENT } from "./config.js";
import { HttpError, isPrivateHostname, isPrivateIp } from "./safety.js";

/*
 * Every request the server makes to a user-supplied address goes through safeFetch:
 *  - only http/https, never localhost / private / link-local / cloud-metadata addresses;
 *  - the IP is checked at connect time (custom DNS lookup), so a hostname that resolves
 *    to a private address, or re-resolves to one later (DNS rebinding), is refused;
 *  - redirects are followed by hand, and every hop is validated the same way;
 *  - idle connections and slow bodies time out.
 */

const MAX_REDIRECTS = 5;

class BlockedAddressError extends Error {
  constructor(hostname) {
    super(`blocked private address for ${hostname}`);
    this.code = "EBLOCKEDADDRESS";
  }
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!addresses.length || addresses.some((a) => isPrivateIp(a.address))) return callback(new BlockedAddressError(hostname));
    if (options?.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

const agent = new Agent({
  connect: { lookup: safeLookup, timeout: 10_000 },
  headersTimeout: 20_000,
  bodyTimeout: 45_000, // no bytes for this long = stalled source
  keepAliveTimeout: 10_000,
  connections: 32, // per origin
});

/** Throws a user-facing HttpError when a URL may not be fetched by the server. */
export function assertFetchable(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "That doesn't look like a valid link.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Only http and https links are supported.");
  if (url.username || url.password) throw new HttpError(400, "Links with a username or password in them aren't supported.");
  if (isPrivateHostname(url.hostname)) throw new HttpError(400, "That link points to a private or internal address, which isn't allowed.");
  return url;
}

function isBlocked(err) {
  for (let e = err; e; e = e.cause) if (e.code === "EBLOCKEDADDRESS") return true;
  return false;
}

/**
 * fetch() with SSRF protection. Returns a normal Response whose .url is the final address
 * and .redirects the number of hops followed.
 */
export async function safeFetch(rawUrl, { headers = {}, method = "GET", signal, timeoutMs = 15_000, maxRedirects = MAX_REDIRECTS } = {}) {
  let current = assertFetchable(rawUrl).href;
  const timeout = timeoutMs ? AbortSignal.timeout(timeoutMs) : null;
  const combined = signal && timeout ? AbortSignal.any([signal, timeout]) : signal || timeout || undefined;
  const finalHeaders = { "User-Agent": USER_AGENT, Accept: "*/*", ...headers };

  for (let hop = 0; ; hop++) {
    let res;
    try {
      res = await undiciFetch(current, { method, headers: finalHeaders, redirect: "manual", signal: combined, dispatcher: agent });
    } catch (err) {
      if (isBlocked(err)) throw new HttpError(400, "That link points to a private or internal address, which isn't allowed.");
      throw err;
    }
    const location = res.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(res.status) && location) {
      res.body?.cancel().catch(() => {});
      if (hop >= maxRedirects) throw new HttpError(422, "That link redirects too many times.");
      let next;
      try {
        next = new URL(location, current).href;
      } catch {
        throw new HttpError(422, "That link redirects to an invalid address.");
      }
      current = assertFetchable(next).href;
      if (res.status === 303) method = "GET";
      continue;
    }
    Object.defineProperty(res, "url", { value: current });
    Object.defineProperty(res, "redirects", { value: hop });
    return res;
  }
}

/** Reads at most maxBytes of a body (then stops downloading). Returns a Buffer. */
export async function readCapped(res, maxBytes) {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.byteLength;
      if (size >= maxBytes) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength))).subarray(0, maxBytes);
}

/** Text body with a hard size limit (HTML pages, playlists, manifests). */
export async function readTextCapped(res, maxBytes, tooLargeMessage = "That file is too large to read.") {
  const declared = Number(res.headers.get("content-length"));
  if (declared && declared > maxBytes) {
    res.body?.cancel().catch(() => {});
    throw new HttpError(413, tooLargeMessage);
  }
  const buf = await readCapped(res, maxBytes + 1);
  if (buf.length > maxBytes) throw new HttpError(413, tooLargeMessage);
  return buf.toString("utf8");
}

export { USER_AGENT };

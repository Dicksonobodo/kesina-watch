import { lookup } from "node:dns/promises";
import net from "node:net";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PRIVATE_V4 = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4ToInt(ip) {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => (n & (~0 << (32 - bits))) >>> 0 === v4ToInt(base));
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  // NAT64 (64:ff9b::a.b.c.d) can wrap a private IPv4 address.
  const nat64 = v6.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
  if (nat64) return isPrivateIp(nat64[1]);
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    /^fe[89ab]/.test(v6) || // link-local
    v6.startsWith("ff") || // multicast
    v6.startsWith("2001:db8") // documentation
  );
}

// Cheap check used on every browser request (no DNS lookup).
export function isPrivateHostname(hostname) {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  return net.isIP(h) ? isPrivateIp(h) : false;
}

// Stops the server from being used to reach your own machine or private network.
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "That doesn't look like a valid link.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new HttpError(400, "Only http and https links are supported.");
  if (isPrivateHostname(url.hostname)) throw new HttpError(400, "That address isn't allowed.");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => {
    throw new HttpError(400, "We couldn't find that website. Check the link.");
  });
  if (addresses.some((a) => isPrivateIp(a.address))) throw new HttpError(400, "That address isn't allowed.");
  return url;
}

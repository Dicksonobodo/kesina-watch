/**
 * Reads an HLS playlist (.m3u8) into an ordered list of pieces, and decrypts
 * AES-128 pieces with the browser's built-in WebCrypto.
 */

export class UnsupportedStreamError extends Error {}

export function parseMasterBest(text, baseUrl) {
  if (!text.includes("#EXT-X-STREAM-INF")) return null;
  const lines = text.split(/\r?\n/);
  let best = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
    const bandwidth = Number(lines[i].match(/[^-]BANDWIDTH=(\d+)/)?.[1]) || 0;
    if (uri && (!best || bandwidth > best.bandwidth)) best = { url: new URL(uri, baseUrl).href, bandwidth };
  }
  return best?.url ?? null;
}

export function parseMediaPlaylist(text, baseUrl) {
  if (!text.startsWith("#EXTM3U")) throw new Error("That stream's playlist couldn't be read.");

  const segments = [];
  let mediaSequence = 0;
  let key = null;
  let map = null;
  let duration = 0;
  let byterange = null;
  const lastEnd = new Map(); // uri → end offset, for byte ranges without an explicit offset

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
      mediaSequence = Number(line.split(":")[1]) || 0;
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const method = attr(line, "METHOD");
      if (method === "NONE") key = null;
      else if (method === "AES-128") {
        key = { uri: new URL(attr(line, "URI"), baseUrl).href, iv: attr(line, "IV") };
      } else {
        throw new UnsupportedStreamError("This stream is DRM-protected, so it can't be downloaded.");
      }
    } else if (line.startsWith("#EXT-X-MAP:")) {
      map = { uri: new URL(attr(line, "URI"), baseUrl).href, range: parseRange(attr(line, "BYTERANGE"), null) };
    } else if (line.startsWith("#EXTINF:")) {
      duration = parseFloat(line.slice(8)) || 0;
    } else if (line.startsWith("#EXT-X-BYTERANGE:")) {
      byterange = line.slice(17);
    } else if (!line.startsWith("#")) {
      const uri = new URL(line, baseUrl).href;
      const range = byterange ? parseRange(byterange, lastEnd.get(uri) ?? 0) : null;
      if (range) lastEnd.set(uri, range[1] + 1);
      segments.push({ uri, duration, key, map, range, sequence: mediaSequence + segments.length });
      byterange = null;
    }
  }

  return {
    segments,
    live: !text.includes("#EXT-X-ENDLIST") && !/#EXT-X-PLAYLIST-TYPE:VOD/.test(text),
    fragmentedMp4: Boolean(map),
    totalDuration: segments.reduce((sum, s) => sum + s.duration, 0),
  };
}

// "1000@200" → [200, 1199]
function parseRange(value, defaultOffset) {
  if (!value) return null;
  const [length, offset] = value.split("@").map(Number);
  const start = Number.isFinite(offset) ? offset : defaultOffset ?? 0;
  return [start, start + length - 1];
}

function attr(line, name) {
  const m = line.match(new RegExp(`${name}=("([^"]*)"|[^,]*)`));
  return m ? (m[2] ?? m[1]) : null;
}

/* ---------- AES-128 ---------- */

export function createDecryptor(fetchBytes) {
  const keys = new Map();

  async function keyFor(uri) {
    if (!keys.has(uri)) {
      keys.set(
        uri,
        fetchBytes(uri).then((raw) => crypto.subtle.importKey("raw", raw, { name: "AES-CBC" }, false, ["decrypt"])),
      );
    }
    return keys.get(uri);
  }

  return async function decrypt(bytes, segment) {
    if (!segment.key) return bytes;
    const cryptoKey = await keyFor(segment.key.uri);
    const iv = segment.key.iv ? hexToBytes(segment.key.iv) : sequenceIv(segment.sequence);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, cryptoKey, bytes));
  };
}

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/i, "").padStart(32, "0");
  return Uint8Array.from(clean.match(/../g), (b) => parseInt(b, 16));
}

// Default IV is the piece's sequence number as a 16-byte big-endian integer.
function sequenceIv(sequence) {
  const iv = new Uint8Array(16);
  new DataView(iv.buffer).setUint32(12, sequence);
  return iv;
}

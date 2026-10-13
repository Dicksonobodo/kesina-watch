/**
 * What a stream piece contains: video, audio or both (and the video height when it can be
 * read). Used to spot video-only playlists so they can be paired with the player's separate
 * audio playlist, instead of producing a silent download.
 */

const u32 = (b, o) => b.readUInt32BE(o);

function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(buf, o);
    const type = buf.toString("latin1", o + 4, o + 8);
    let header = 8;
    if (size === 1) {
      if (o + 16 > end) break;
      size = u32(buf, o + 8) * 2 ** 32 + u32(buf, o + 12);
      header = 16;
    } else if (size === 0) size = end - o;
    if (size < header) break;
    out.push({ type, start: o, end: Math.min(o + size, end), header, complete: o + size <= end });
    o += size;
  }
  return out;
}

/** Tracks in an MP4 init segment / file header (ftyp + moov). null when moov isn't in buf. */
export function mp4Tracks(buf) {
  const moov = boxes(buf).find((b) => b.type === "moov" && b.complete);
  if (!moov) return null;
  const result = { video: false, audio: false, height: null };
  for (const trak of boxes(buf, moov.start + moov.header, moov.end).filter((b) => b.type === "trak")) {
    const parts = boxes(buf, trak.start + trak.header, trak.end);
    const mdia = parts.find((b) => b.type === "mdia");
    const hdlr = mdia && boxes(buf, mdia.start + mdia.header, mdia.end).find((b) => b.type === "hdlr");
    const handler = hdlr ? buf.toString("latin1", hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) : "";
    if (handler === "vide") {
      result.video = true;
      const tkhd = parts.find((b) => b.type === "tkhd");
      if (tkhd) {
        const h = Math.round(u32(buf, tkhd.end - 4) / 65536);
        if (h > 0) result.height = Math.max(result.height ?? 0, h);
      }
    }
    if (handler === "soun") result.audio = true;
  }
  return result;
}

// MPEG-TS stream types (ISO 13818-1 + common registrations).
const TS_VIDEO = new Set([0x01, 0x02, 0x10, 0x1b, 0x24, 0x42, 0xea]);
const TS_AUDIO = new Set([0x03, 0x04, 0x0f, 0x11, 0x1c, 0x81, 0x82, 0x83, 0x84, 0x87]);

/** Tracks listed in a transport stream's PMT. null when it can't be read. */
export function tsTracks(buf) {
  let pmtPid = null;
  for (let o = buf.indexOf(0x47); o >= 0 && o + 188 <= buf.length; o += 188) {
    if (buf[o] !== 0x47) return null;
    const pid = ((buf[o + 1] & 0x1f) << 8) | buf[o + 2];
    const start = buf[o + 1] & 0x40;
    if (!start) continue;
    let p = o + 4;
    const afc = (buf[o + 3] >> 4) & 3;
    if (afc === 2) continue;
    if (afc === 3) p += 1 + buf[p];
    p += 1 + buf[p]; // pointer field
    if (pid === 0 && buf[p] === 0x00) {
      // PAT: first program with a non-zero number.
      const len = ((buf[p + 1] & 0x0f) << 8) | buf[p + 2];
      for (let q = p + 8; q + 4 <= p + 3 + len - 4; q += 4) {
        if (((buf[q] << 8) | buf[q + 1]) !== 0) {
          pmtPid = ((buf[q + 2] & 0x1f) << 8) | buf[q + 3];
          break;
        }
      }
    } else if (pmtPid !== null && pid === pmtPid && buf[p] === 0x02) {
      const len = ((buf[p + 1] & 0x0f) << 8) | buf[p + 2];
      const infoLen = ((buf[p + 10] & 0x0f) << 8) | buf[p + 11];
      const result = { video: false, audio: false, height: null };
      for (let q = p + 12 + infoLen; q + 5 <= p + 3 + len - 4; ) {
        const type = buf[q];
        if (TS_VIDEO.has(type)) result.video = true;
        if (TS_AUDIO.has(type)) result.audio = true;
        q += 5 + (((buf[q + 3] & 0x0f) << 8) | buf[q + 4]);
      }
      return result;
    }
  }
  return null;
}

/** Packed audio (HLS .aac / .mp3 / .ac3 pieces): ID3 tag or an ADTS / MPEG audio frame. */
export function isPackedAudio(buf, url = "") {
  if (/\.(aac|mp3|ac3|ec3|m4a)(\?|$)/i.test(url)) return true;
  if (buf.length >= 3 && buf.toString("latin1", 0, 3) === "ID3") return true;
  return buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xf0) === 0xf0;
}

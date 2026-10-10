import { createFetcher, withRetry } from "./fetcher";
import { reportError } from "@/lib/monitoring";
import { createDecryptor, parseMasterBest, parseMediaPlaylist, UnsupportedStreamError } from "./hls";

const FILE_CHUNK = 8 * 1024 * 1024; // MP4s are fetched in 8 MB ranges so they can pause and retry
const PARALLEL_PIECES = 5;
const LOOKAHEAD = 16; // max pieces held in memory ahead of the writer
const EMIT_EVERY_MS = 250;
const SPEED_WINDOW_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One download. States: preparing → downloading ⇄ paused → finishing → done
 *                                                 ↘ error / canceled
 */
export class DownloadJob {
  constructor({ id, source, sink, meta, onChange }) {
    this.id = id;
    this.source = source;
    this.sink = sink;
    this.meta = meta;
    this.onChange = onChange;
    this.fetcher = createFetcher(source);
    this.controller = new AbortController();

    this.status = "preparing";
    this.bytes = 0;
    this.total = source.size || null;
    this.piecesDone = 0;
    this.piecesTotal = null;
    this.speed = 0;
    this.eta = null;
    this.error = null;
    this.startedAt = Date.now();
    this.finishedAt = null;

    this.paused = false;
    this.wakers = [];
    this.samples = [];
    this.lastEmit = 0;
  }

  snapshot() {
    return {
      id: this.id,
      ...this.meta,
      quality: this.source.quality,
      type: this.source.type,
      status: this.status,
      bytes: this.bytes,
      total: this.total,
      progress: this.total ? Math.min(1, this.bytes / this.total) : this.piecesTotal ? this.piecesDone / this.piecesTotal : 0,
      speed: this.speed,
      eta: this.eta,
      piecesDone: this.piecesDone,
      piecesTotal: this.piecesTotal,
      via: this.fetcher.mode,
      sink: this.sink.kind,
      fileName: this.sink.name,
      error: this.error,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }

  emit(force = false) {
    const now = Date.now();
    if (!force && now - this.lastEmit < EMIT_EVERY_MS) return;
    this.lastEmit = now;
    this.onChange(this.snapshot());
  }

  setStatus(status) {
    this.status = status;
    if (["done", "error", "canceled"].includes(status)) this.finishedAt = Date.now();
    this.emit(true);
  }

  addBytes(n) {
    this.bytes += n;
    const now = Date.now();
    this.samples.push([now, this.bytes]);
    while (this.samples.length > 2 && now - this.samples[0][0] > SPEED_WINDOW_MS) this.samples.shift();
    const [t0, b0] = this.samples[0];
    if (now > t0) this.speed = ((this.bytes - b0) * 1000) / (now - t0);
    this.eta = this.total && this.speed > 0 ? Math.max(0, (this.total - this.bytes) / this.speed) : null;
    this.emit();
  }

  get stopped() {
    return this.controller.signal.aborted;
  }

  pause() {
    if (!["downloading", "preparing"].includes(this.status)) return;
    this.paused = true;
    this.speed = 0;
    this.eta = null;
    this.samples = [];
    this.setStatus("paused");
  }

  resume() {
    if (this.status !== "paused") return;
    this.paused = false;
    this.setStatus("downloading");
    this.wakers.splice(0).forEach((wake) => wake());
  }

  cancel() {
    this.controller.abort();
    this.wakers.splice(0).forEach((wake) => wake());
    this.sink.abort();
    this.setStatus("canceled");
  }

  async waitIfPaused() {
    while (this.paused && !this.stopped) await new Promise((r) => this.wakers.push(r));
  }

  async run() {
    try {
      if (this.source.type === "hls") await this.runHls();
      else await this.runFile();
      if (this.stopped) return;
      this.setStatus("finishing");
      await this.sink.close();
      this.eta = 0;
      this.speed = 0;
      this.setStatus("done");
    } catch (err) {
      if (this.stopped) return;
      this.error = friendlyError(err);
      // Expected failures (DRM, live, expired link, source refused) aren't bugs; the rest are worth seeing.
      if (!(err instanceof UnsupportedStreamError) && ![401, 403, 404, 410].includes(err.status)) {
        reportError(err, { where: "download", type: this.source.type, via: this.fetcher.mode, pieces: this.piecesDone });
      }
      this.sink.abort();
      this.setStatus("error");
    }
  }

  /* ---------- single MP4 file ---------- */

  async runFile() {
    const signal = this.controller.signal;
    const url = this.source.url;
    let offset = 0;
    this.setStatus("downloading");

    for (;;) {
      await this.waitIfPaused();
      if (this.stopped) return;

      const end = offset + FILE_CHUNK - 1;
      const res = await withRetry(() => this.fetcher.fetch(url, { range: [offset, end], signal }), { signal });

      if (res.status === 200) {
        // Source ignores ranges: stream the whole file in one go (pausing still works by not reading).
        this.total = Number(res.headers.get("content-length")) || this.total;
        await this.pipe(res.body, () => {});
        return;
      }

      this.total = Number(res.headers.get("content-range")?.split("/")[1]) || this.total;
      let received = 0;
      await this.pipe(res.body, (n) => (received += n));
      offset += received;
      if (!received || (this.total && offset >= this.total)) return;
    }
  }

  async pipe(body, onBytes) {
    const reader = body.getReader();
    for (;;) {
      if (this.paused) await this.waitIfPaused();
      if (this.stopped) {
        reader.cancel().catch(() => {});
        return;
      }
      const { done, value } = await reader.read();
      if (done) return;
      await this.sink.write(value);
      onBytes(value.byteLength);
      this.addBytes(value.byteLength);
    }
  }

  /* ---------- HLS stream → MP4 ---------- */

  async runHls() {
    const signal = this.controller.signal;
    let playlistUrl = this.source.url;
    let text = await withRetry(() => this.fetcher.text(playlistUrl, { signal }), { signal });

    const best = parseMasterBest(text, playlistUrl);
    if (best) {
      playlistUrl = best;
      text = await withRetry(() => this.fetcher.text(playlistUrl, { signal }), { signal });
    }

    const playlist = parseMediaPlaylist(text, playlistUrl);
    if (playlist.live) throw new UnsupportedStreamError("This is a live stream. Live streams can be watched, not downloaded.");
    if (!playlist.segments.length) throw new Error("That stream has no video pieces.");

    const { segments } = playlist;
    this.piecesTotal = segments.length;
    const decrypt = createDecryptor((uri) => withRetry(() => this.fetcher.bytes(uri, { signal }), { signal }));
    const transform = playlist.fragmentedMp4 ? await this.fmp4Writer(segments[0].map, signal) : await this.tsToMp4Writer();

    this.setStatus("downloading");

    const ready = new Map();
    let next = 0;
    let failure = null;

    const worker = async () => {
      while (!failure && !this.stopped) {
        await this.waitIfPaused();
        if (this.stopped || next >= segments.length) return;
        if (next - this.piecesDone >= LOOKAHEAD) {
          await sleep(60);
          continue;
        }
        const i = next++;
        const seg = segments[i];
        try {
          const raw = await withRetry(() => this.fetcher.bytes(seg.uri, { range: seg.range, signal }), { signal });
          ready.set(i, await decrypt(raw, seg));
          this.addBytes(raw.byteLength);
          // Real sizes replace the playlist's bandwidth estimate as pieces arrive.
          const done = ready.size + this.piecesDone;
          if (done >= 3) this.total = Math.max(this.bytes, Math.round((this.bytes / done) * segments.length));
        } catch (err) {
          failure ??= err;
        }
      }
    };

    const workers = Array.from({ length: PARALLEL_PIECES }, worker);

    // Writer: strictly in order, as pieces become available.
    while (this.piecesDone < segments.length) {
      if (failure) throw failure;
      if (this.stopped) return;
      const data = ready.get(this.piecesDone);
      if (!data) {
        await sleep(40);
        continue;
      }
      ready.delete(this.piecesDone);
      const out = transform(data);
      for (const chunk of out) await this.sink.write(chunk);
      this.piecesDone++;
      this.emit();
    }
    await Promise.all(workers);
    for (const chunk of transform.flush?.() ?? []) await this.sink.write(chunk);
  }

  // Pieces are already MP4 fragments: write the init segment once, then pieces as-is.
  async fmp4Writer(map, signal) {
    const init = await withRetry(() => this.fetcher.bytes(map.uri, { range: map.range, signal }), { signal });
    let wroteInit = false;
    return (data) => {
      const out = wroteInit ? [data] : [init, data];
      wroteInit = true;
      return out;
    };
  }

  // MPEG-TS pieces are converted to MP4 fragments with mux.js. If the conversion
  // can't handle the stream, fall back to saving the original .ts (plays in VLC).
  async tsToMp4Writer() {
    const { default: muxjs } = await import("mux.js");
    const transmuxer = new muxjs.mp4.Transmuxer({ remux: true });
    let pending = [];
    let wroteInit = false;
    let rawTs = false;
    transmuxer.on("data", (segment) => {
      if (!wroteInit) {
        pending.push(segment.initSegment);
        wroteInit = true;
      }
      pending.push(segment.data);
    });

    return (data) => {
      if (rawTs) return [data];
      transmuxer.push(data);
      transmuxer.flush();
      if (!wroteInit && this.piecesDone === 0) {
        rawTs = true;
        this.sink.setExtension("ts");
        return [data];
      }
      const out = pending;
      pending = [];
      return out;
    };
  }
}

function friendlyError(err) {
  if (err instanceof UnsupportedStreamError) return err.message;
  if (err.status === 401) return "The download link expired. Detect the movie again and retry.";
  if (err.status === 403) return "The video source refused the download.";
  if (err.status === 404 || err.status === 410) return "The video is no longer at that address. Detect it again.";
  if (err.name === "QuotaExceededError" || /memory|allocation/i.test(err.message)) {
    return "Your device ran out of space or memory. Try a lower quality.";
  }
  if (err instanceof TypeError) return "Network problem. Check your connection and retry.";
  return err.message || "The download failed.";
}

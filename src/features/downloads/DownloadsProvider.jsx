import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DownloadJob } from "./engine/job";
import { canRelay, relayUrl } from "./engine/fetcher";
import { canWriteToDisk, openDiskSink, openMemorySink, saveUrl } from "./engine/sinks";
import { useLibrary } from "@/features/library/LibraryProvider";
import { deviceName, toMillis } from "@/lib/userData";
import { reportError } from "@/lib/monitoring";
import { notify, requestNotifications } from "@/lib/notify";

const DownloadsContext = createContext(null);

// Without a disk to write to, bigger files go through the browser's own download manager.
const MEMORY_LIMIT = 700 * 1024 * 1024;

export const ACTIVE = new Set(["preparing", "downloading", "paused", "finishing"]);

// Identifies this tab, so other tabs/devices can tell a running download from a dead one.
const SESSION = crypto.randomUUID();
const HEARTBEAT_MS = 60_000;
const STALE_MS = 3 * 60_000;

export function fileNameFor(result, source) {
  const base = `${result.title}${result.year ? ` (${result.year})` : ""} [${source.quality}]`;
  return `${base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.mp4`;
}

/** Why a source can't be downloaded, or null when it can. */
export function downloadBlocker(source) {
  if (!source) return "Pick a quality first.";
  if (source.live) return "Live streams can be watched, not downloaded.";
  if (source.type === "dash") return "This stream format (DASH) can't be downloaded yet.";
  if (source.audioUrl) return "This stream keeps its audio separate. Downloading it is coming soon.";
  return null;
}

// Fields saved to the user's library (users/{uid}/library/{jobId}).
function persistable(snap) {
  return {
    kind: "download",
    title: snap.title,
    year: snap.year ?? null,
    poster: snap.poster ?? null,
    palette: snap.palette ?? null,
    site: snap.site ?? null,
    pageUrl: snap.pageUrl ?? null,
    quality: snap.quality,
    type: snap.type,
    status: snap.status,
    bytes: snap.bytes ?? 0,
    total: snap.total ?? null,
    progress: snap.progress ?? 0,
    fileName: snap.fileName ?? null,
    error: snap.error ?? null,
    device: deviceName(),
    session: SESSION,
    startedAt: snap.startedAt ?? Date.now(),
    finishedAt: snap.finishedAt ?? null,
  };
}

export function DownloadsProvider({ children }) {
  const library = useLibrary();
  const [jobs, setJobs] = useState([]);
  const instances = useRef(new Map());
  const origins = useRef(new Map()); // id → { result, source } for retries
  const persisted = useRef(new Map()); // id → { status, bucket } last written
  const libraryRef = useRef(library);
  libraryRef.current = library;

  // Write on status changes, every 10%, and once a minute while running (so other devices
  // can see it's alive) — not on every progress tick (Firestore free tier).
  const persist = useCallback((snap) => {
    const bucket = Math.floor((snap.progress || 0) * 10);
    const prev = persisted.current.get(snap.id);
    const heartbeatDue = prev && ACTIVE.has(snap.status) && Date.now() - prev.at > HEARTBEAT_MS;
    if (prev && prev.status === snap.status && prev.bucket === bucket && !heartbeatDue) return;
    persisted.current.set(snap.id, { status: snap.status, bucket, at: Date.now() });
    if (prev && prev.status !== snap.status) {
      if (snap.status === "done") notify("Download finished", `${snap.title} (${snap.quality}) is saved.`);
      if (snap.status === "error") notify("Download failed", `${snap.title}: ${snap.error ?? "tap to retry"}`);
    }
    if (snap.status === "canceled") libraryRef.current.remove(snap.id).catch(() => {});
    else libraryRef.current.put(snap.id, persistable(snap)).catch(() => {}); // reported by the data layer
  }, []);

  const upsert = useCallback((snap) => {
    persist(snap);
    setJobs((list) => {
      const i = list.findIndex((j) => j.id === snap.id);
      if (i === -1) return [snap, ...list];
      const copy = list.slice();
      copy[i] = snap;
      return copy;
    });
  }, [persist]);

  /**
   * Must be called directly from a click (the save dialog needs a user action).
   * Returns the job id, or null if the user closed the save dialog.
   */
  const startDownload = useCallback(
    async (result, source) => {
      const blocked = downloadBlocker(source);
      if (blocked) throw new Error(blocked);

      const id = crypto.randomUUID();
      origins.current.set(id, { result, source });
      const fileName = fileNameFor(result, source);
      const meta = { title: result.title, year: result.year, poster: result.poster, palette: result.palette, site: result.site, pageUrl: result.url };

      // Big MP4 on a browser that can't write to disk: hand it to the browser's download manager.
      const bigForMemory = source.type === "file" && !canWriteToDisk && (!source.size || source.size > MEMORY_LIMIT);
      if (bigForMemory) {
        saveUrl(canRelay(source) ? relayUrl(source, source.url, { dl: fileName }) : source.url, fileName);
        upsert({
          id,
          ...meta,
          quality: source.quality,
          type: source.type,
          status: "handed",
          bytes: 0,
          total: source.size,
          progress: 1,
          fileName,
          startedAt: Date.now(),
          finishedAt: Date.now(),
        });
        return id;
      }

      let sink;
      try {
        sink = canWriteToDisk ? await openDiskSink(fileName) : openMemorySink(fileName);
      } catch (err) {
        if (err.name === "AbortError") return null; // closed the save dialog
        throw err;
      }

      const job = new DownloadJob({ id, source, sink, meta, onChange: upsert });
      instances.current.set(id, job);
      upsert(job.snapshot());
      job.run();
      // After the save dialog: ask once, so we can say when it's done.
      requestNotifications();
      return id;
    },
    [upsert],
  );

  const control = useCallback((id, action) => instances.current.get(id)?.[action]?.(), []);

  // Removes a download from the tray (this session). It stays in the library.
  const dismiss = useCallback((id) => {
    const job = instances.current.get(id);
    if (job && ACTIVE.has(job.status)) job.cancel();
    instances.current.delete(id);
    setJobs((list) => list.filter((j) => j.id !== id));
  }, []);

  // Removes a download from the library everywhere (and from the tray).
  const forget = useCallback(
    (id) => {
      dismiss(id);
      origins.current.delete(id);
      persisted.current.delete(id);
      return libraryRef.current.remove(id);
    },
    [dismiss],
  );

  // Retry = a fresh download of the same source (call from a click, like startDownload).
  const retry = useCallback(
    async (id) => {
      const origin = origins.current.get(id);
      if (!origin) return null;
      dismiss(id);
      return startDownload(origin.result, origin.source);
    },
    [dismiss, startDownload],
  );

  const clearFinished = useCallback(() => {
    setJobs((list) => list.filter((j) => ACTIVE.has(j.status)));
  }, []);

  // If the tab closes anyway, record running downloads as interrupted (queued offline if needed).
  useEffect(() => {
    const onHide = () => {
      for (const job of instances.current.values()) {
        if (ACTIVE.has(job.status)) libraryRef.current.put(job.id, { status: "interrupted" }).catch(() => {});
      }
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  // Closing the tab would kill running downloads: ask first.
  const activeCount = jobs.filter((j) => ACTIVE.has(j.status)).length;
  useEffect(() => {
    if (!activeCount) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [activeCount]);

  // Library view: synced history, with this session's live jobs on top of it. Anything that
  // was mid-download when its tab closed can't continue, so it shows as interrupted.
  const items = useMemo(() => {
    const live = new Map(jobs.map((j) => [j.id, j]));
    const history = library.downloads
      .filter((d) => !live.has(d.id))
      .map((d) => {
        if (!ACTIVE.has(d.status)) return d;
        const fresh = Date.now() - toMillis(d.updatedAt) < STALE_MS;
        return fresh && d.session !== SESSION ? { ...d, status: "remote" } : { ...d, status: "interrupted" };
      });
    return [...jobs, ...history];
  }, [jobs, library.downloads]);

  const value = useMemo(
    () => ({
      jobs,
      items,
      canRetry: (id) => origins.current.has(id),
      activeCount,
      startDownload,
      pause: (id) => control(id, "pause"),
      resume: (id) => control(id, "resume"),
      cancel: (id) => control(id, "cancel"),
      dismiss,
      forget,
      retry,
      clearFinished,
    }),
    [jobs, items, activeCount, startDownload, control, dismiss, forget, retry, clearFinished],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}

export function useDownloads() {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads must be used inside <DownloadsProvider>");
  return ctx;
}

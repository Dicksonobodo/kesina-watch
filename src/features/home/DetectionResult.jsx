import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bookmark, BookmarkCheck, Clock, Download, ExternalLink, Globe, Lock, Pin, PinOff, Play, RotateCcw, SearchX, ShieldCheck } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { Badge, LiveDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Poster } from "@/components/ui/Poster";
import { cn } from "@/lib/cn";
import { downloadBlocker, useDownloads } from "@/features/downloads/DownloadsProvider";
import { canWriteToDisk } from "@/features/downloads/engine/sinks";
import { Player } from "@/features/player/Player";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLibrary } from "@/features/library/LibraryProvider";
import { pinSite } from "@/features/sites/SitesPage";
import { idFromUrl, removeItem, useUserCollection } from "@/lib/userData";

const ease = [0.22, 1, 0.36, 1];

export function DetectionResult({ result, onReset, autoplay = null }) {
  const [selected, setSelected] = useState(result.sources[0]?.id);
  const [note, setNote] = useState("");
  const [a, b] = result.palette ?? ["#c6ff3d", "#0f7b5f"];
  const source = result.sources.find((s) => s.id === selected);
  const hasSources = result.sources.length > 0;
  const { startDownload } = useDownloads();
  const [starting, setStarting] = useState(false);
  // Arriving from "Continue watching" (or a play link) opens the player straight away.
  const [watching, setWatching] = useState(() => Boolean(autoplay && !result.demo && result.sources.length));
  const { user } = useAuth();
  const { isSaved, toggleSaved } = useLibrary();
  const { items: sites } = useUserCollection(user?.uid, "sites");
  const saved = isSaved(result.url);
  const siteId = idFromUrl("site", result.url);
  const pinned = sites.some((s) => s.id === siteId);

  function onSave() {
    if (result.demo) return comingSoon("Saving to your library");
    toggleSaved(result).catch((err) => setNote(err.message));
    setNote(saved ? "" : "Saved. Find it in your Library on any device.");
  }

  function onPin() {
    if (result.demo) return comingSoon("Pinning");
    const action = pinned ? removeItem(user.uid, "sites", siteId) : pinSite(user.uid, { url: result.url, name: result.title, kind: "live" });
    action.catch((err) => setNote(err.message));
    setNote(pinned ? "" : "Pinned to Sites. Tap it there any time to watch live.");
  }
  const blocker = downloadBlocker(source);

  function comingSoon(what) {
    setNote(
      result.demo
        ? `Demo result: ${what} switches on once the detection server is connected.`
        : `${what} arrives in the next update. The video source is found and ready.`,
    );
  }

  function onWatch() {
    if (result.demo) return comingSoon("The clean player");
    if (source?.type === "dash") return setNote("This stream format (DASH) can't be played here yet. Open the original page instead.");
    setNote("");
    setWatching(true);
  }

  async function onDownload() {
    if (result.demo) return comingSoon("Downloading");
    setStarting(true);
    setNote("");
    try {
      const id = await startDownload(result, source);
      if (id) {
        setNote(
          canWriteToDisk || source.type === "hls" || (source.size && source.size <= 700 * 1024 ** 2)
            ? "Downloading. Track it in the downloads panel. Keep this tab open until it finishes."
            : "Sent to your browser's downloads. It handles the progress from here.",
        );
      }
    } catch (err) {
      setNote(err.message);
    } finally {
      setStarting(false);
    }
  }

  return (
    <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: 10 }} className="relative">
      {/* Ambient glow from the poster's colours */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease }}
        className="pointer-events-none absolute -inset-x-10 -top-20 -bottom-10 -z-10"
        style={{
          background: `radial-gradient(40% 50% at 20% 40%, ${a}33, transparent 70%), radial-gradient(40% 50% at 70% 60%, ${b}40, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />

      <div className="glass grid gap-6 rounded-[28px] p-5 sm:grid-cols-[220px_1fr] sm:gap-8 sm:p-7">
        <motion.div
          initial={{ filter: "blur(24px)", scale: 1.06, opacity: 0 }}
          animate={{ filter: "blur(0px)", scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease }}
          className="mx-auto w-44 sm:w-full"
        >
          <Poster src={result.poster} title={result.title} year={result.year} palette={result.palette} className="shadow-2xl shadow-black/50" />
        </motion.div>

        <div className="flex min-w-0 flex-col">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, ease }}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="signal">
                <ShieldCheck className="size-3" />
                {result.adsBlocked} {result.adsBlocked === 1 ? "ad" : "ads"} blocked
              </Badge>
              {result.popupsBlocked > 0 && <Badge>{result.popupsBlocked} pop-ups stopped</Badge>}
              {result.live && (
                <Badge tone="live">
                  <LiveDot /> Live
                </Badge>
              )}
              {result.demo && <Badge>Demo</Badge>}
            </div>
            <h2 className="mt-4 font-display text-[clamp(26px,4vw,40px)] leading-[1.02] font-bold tracking-tight text-balance break-words">
              {result.title}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-mist-500">
              {result.year && <span>{result.year}</span>}
              {result.runtime > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {result.runtime >= 60 ? `${Math.floor(result.runtime / 60)}h ${result.runtime % 60}m` : `${result.runtime}m`}
                </span>
              )}
              {result.site && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-center gap-1.5 transition hover:text-mist-100"
                >
                  <Globe className="size-3.5 shrink-0" />
                  <span className="truncate">{result.site}</span>
                </a>
              )}
            </div>
          </motion.div>

          {hasSources ? (
            <>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, ease }} className="mt-7">
                <p className="mb-2.5 font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">
                  {result.sources.length > 1 ? "Quality" : "Source"}
                </p>
                <div role="radiogroup" className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
                  {result.sources.map((s) => (
                    <button
                      key={s.id}
                      role="radio"
                      aria-checked={selected === s.id}
                      onClick={() => setSelected(s.id)}
                      className={cn(
                        "relative rounded-2xl px-3 py-3 text-left ring-1 transition",
                        selected === s.id ? "bg-signal/[.08] ring-signal/60" : "bg-white/[.03] ring-white/[.08] hover:bg-white/[.06]",
                      )}
                    >
                      <span className={cn("block font-display text-[15px] font-bold", selected === s.id && "text-signal")}>{s.quality}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-mist-500">
                        {s.live ? "live" : s.size ? `${s.type === "hls" ? "~" : ""}${formatBytes(s.size)}` : sourceKind(s)}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, ease }}
                className="mt-6 flex flex-col gap-2.5 sm:mt-auto sm:flex-row sm:pt-7"
              >
                {!result.live && (
                  <Button
                    size="lg"
                    className="sm:flex-1"
                    loading={starting}
                    disabled={Boolean(blocker) && !result.demo}
                    onClick={onDownload}
                  >
                    {!starting && <Download className="size-[18px]" />}
                    Download {source?.quality}
                    {source?.size > 0 && <span className="font-mono text-xs font-medium opacity-60">{formatBytes(source.size)}</span>}
                  </Button>
                )}
                <Button
                  variant={result.live ? "primary" : "ghost"}
                  size="lg"
                  className={cn(result.live && "sm:flex-1")}
                  onClick={onWatch}
                >
                  <Play className="size-[18px]" /> {result.live ? "Watch live" : "Watch"}
                </Button>
                {result.live ? (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={onPin}
                    aria-label={pinned ? "Unpin from Sites" : "Pin to Sites"}
                    title={pinned ? "Unpin from Sites" : "Pin to Sites"}
                    className={cn(pinned && "text-signal ring-1 ring-signal/40")}
                  >
                    {pinned ? <PinOff className="size-[18px]" /> : <Pin className="size-[18px]" />}
                    <span className="sm:hidden">{pinned ? "Pinned" : "Pin"}</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={onSave}
                    aria-label={saved ? "Remove from saved" : "Save for later"}
                    title={saved ? "Remove from saved" : "Save for later"}
                    className={cn(saved && "text-signal ring-1 ring-signal/40")}
                  >
                    {saved ? <BookmarkCheck className="size-[18px]" /> : <Bookmark className="size-[18px]" />}
                    <span className="sm:hidden">{saved ? "Saved" : "Save"}</span>
                  </Button>
                )}
              </motion.div>
            </>
          ) : (
            <NoSource drm={result.drm} url={result.url} />
          )}

          <AnimatePresence>
            {(note || (hasSources && blocker && !result.live)) && (
              <motion.p
                key={note || blocker}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 text-[13px] text-mist-500"
              >
                {note || blocker}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <Button variant="subtle" size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" /> Detect another link
        </Button>
      </div>

      <AnimatePresence>
        {watching && <Player key={source.id} result={result} source={source} resumeAt={autoplay?.at} onClose={() => setWatching(false)} />}
      </AnimatePresence>
    </motion.section>
  );
}

function sourceKind(s) {
  if (s.type === "hls") return "stream";
  if (s.type === "dash") return "dash";
  return s.container || "file";
}

function NoSource({ drm, url }) {
  const Icon = drm ? Lock : SearchX;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, ease }}
      className="mt-7 rounded-2xl bg-white/[.03] p-5 ring-1 ring-white/[.08] sm:mt-auto"
    >
      <div className="flex gap-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl ring-1", drm ? "bg-live/10 text-live ring-live/25" : "bg-white/[.05] text-mist-300 ring-white/10")}>
          <Icon className="size-[18px]" />
        </span>
        <div>
          <p className="font-semibold">{drm ? "This video is DRM-protected" : "No video found on this page"}</p>
          <p className="mt-1 text-sm leading-relaxed text-mist-500">
            {drm
              ? "It's locked by the provider, so it can't be downloaded or played outside their site."
              : "The page may need you to pick an episode or server first, or the video is on another page. Try the link of the page where the player is."}
          </p>
        </div>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-mist-300 transition hover:text-signal"
      >
        Open original page <ExternalLink className="size-3.5" />
      </a>
    </motion.div>
  );
}

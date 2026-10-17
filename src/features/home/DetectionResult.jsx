import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Clock, ExternalLink, ListVideo, Globe, Info, Lock, Pin, PinOff, Play, RotateCcw, SearchX, ShieldCheck } from "lucide-react";
import { formatBytes } from "@/lib/format";
import { Badge, LiveDot } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Poster } from "@/components/ui/Poster";
import { cn } from "@/lib/cn";
import { sourcesOf as sourcesOfStream, streamsOf, useLiveSession } from "@/features/live/LiveSession";
import { useAuth } from "@/features/auth/AuthProvider";
import { pinSite } from "@/features/sites/SitesPage";
import { idFromUrl, removeItem, useUserCollection } from "@/lib/userData";

const ease = [0.22, 1, 0.36, 1];

export function DetectionResult({ result, onReset, autoplay = null, onAutoplayed, liveOnly = false }) {
  // A page can carry several streams (channels, cameras, feeds): each has its own title and qualities.
  const streamList = useMemo(() => streamsOf(result, liveOnly), [result, liveOnly]);
  const sourcesOf = (st) => sourcesOfStream(result, st, liveOnly);
  // The player lives in the app frame, so it keeps playing (in the mini player) on other pages.
  const session = useLiveSession();
  const playingHere = session.now?.result.url === result.url ? session.now : null;
  const [streamId, setStreamId] = useState(playingHere?.streamId ?? streamList[0]?.id ?? null);
  const current = streamList.find((st) => st.id === streamId) ?? streamList[0];
  const sources = current ? sourcesOf(current) : [];
  const [selected, setSelected] = useState(playingHere?.sourceId ?? sources[0]?.id);
  const [note, setNote] = useState("");
  const [a, b] = result.palette ?? ["#c6ff3d", "#0f7b5f"];
  const source = sources.find((s) => s.id === selected) ?? sources[0];
  const hasSources = sources.length > 0;
  const multi = streamList.length > 1;

  const startPlayer = (st, sourceId, resumeAt = 0) => session.play({ result, liveOnly, streamId: st?.id ?? null, sourceId, resumeAt });

  // Arriving from a play link opens the player straight away (once: not again on coming back).
  useEffect(() => {
    if (!autoplay || result.demo || !result.sources.length) return;
    startPlayer(current, source?.id, autoplay.at);
    onAutoplayed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay]);

  // The stream was switched from the player's own menu: show the same one here.
  useEffect(() => {
    if (!playingHere || playingHere.streamId === streamId) return;
    setStreamId(playingHere.streamId);
    setSelected(playingHere.sourceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingHere?.streamId]);

  // Picks a stream (and its best quality); `play` starts it, also while the player is open.
  function chooseStream(id, play = false) {
    const st = streamList.find((x) => x.id === id);
    if (!st) return;
    setStreamId(st.id);
    setSelected(sourcesOf(st)[0]?.id);
    setNote("");
    if (play) startPlayer(st, sourcesOf(st)[0]?.id);
  }
  const { user } = useAuth();
  const { items: sites } = useUserCollection(user?.uid, "sites");
  const siteId = idFromUrl("site", result.url);
  const pinned = sites.some((s) => s.id === siteId);

  function onPin() {
    if (result.demo) return comingSoon("Pinning");
    const action = pinned ? removeItem(user.uid, "sites", siteId) : pinSite(user.uid, { url: result.url, name: result.title, kind: "live" });
    action.catch((err) => setNote(err.message));
    setNote(pinned ? "" : "Pinned to Sites. Tap it there any time to watch live.");
  }

  function comingSoon(what) {
    setNote(
      result.demo
        ? `Demo result: ${what} switches on once the detection server is connected.`
        : `${what} arrives in the next update. The video source is found and ready.`,
    );
  }

  function onWatch() {
    if (result.demo) return comingSoon("The clean player");
    setNote("");
    startPlayer(current, source?.id);
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
              {multi && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, ease }} className="mt-7">
                  <p className="mb-2.5 flex items-center gap-2 font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">
                    <ListVideo className="size-3.5" /> {streamList.length} {liveOnly ? "live streams" : "streams"} on this page
                  </p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {streamList.map((st) => {
                      const active = st.id === current?.id;
                      return (
                        <li key={st.id}>
                          <button
                            onClick={() => chooseStream(st.id, true)}
                            aria-current={active}
                            className={cn(
                              "group flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left ring-1 transition",
                              active ? "bg-signal/[.08] ring-signal/60" : "bg-white/[.03] ring-white/[.08] hover:bg-white/[.06]",
                            )}
                          >
                            <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl ring-1 transition", active ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.06] text-mist-300 ring-white/10 group-hover:text-mist-100")}>
                              <Play className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn("block truncate text-[14px] font-semibold", active && "text-signal")}>{st.title}</span>
                              <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-mist-500">
                                {st.live && (
                                  <>
                                    <LiveDot /> Live
                                  </>
                                )}
                                {st.qualities?.length > 0 && <span>{st.live ? "· " : ""}{st.qualities.slice(0, 3).join(" · ")}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              )}

              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, ease }} className="mt-7">
                <p className="mb-2.5 font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">
                  {sources.length > 1 ? "Quality" : "Source"}
                </p>
                <div role="radiogroup" className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2">
                  {sources.map((s) => (
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
                        {sourceKind(s)}
                        {s.live ? " · live" : s.noAudio ? " · no sound" : s.size ? ` · ${sizeText(s)}` : ""}
                      </span>
                      {s.downloadable === false && !s.live && (
                        <Lock className="absolute top-2.5 right-2.5 size-3 text-mist-700" aria-label="Can't be downloaded" />
                      )}
                    </button>
                  ))}
                </div>
                {source && <SourceDetails source={source} />}
                {result.notes?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {result.notes.map((n) => (
                      <li key={n} className="flex items-start gap-1.5 text-[12px] leading-relaxed text-mist-500">
                        <Info className="mt-0.5 size-3 shrink-0" /> {n}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, ease }}
                className="mt-6 flex flex-col gap-2.5 sm:mt-auto sm:flex-row sm:pt-7"
              >
                <Button
                  variant={result.live ? "primary" : "ghost"}
                  size="lg"
                  className={cn(result.live && "sm:flex-1")}
                  onClick={onWatch}
                >
                  <Play className="size-[18px]" /> {result.live ? "Watch live" : "Watch"}
                </Button>
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
              </motion.div>
            </>
          ) : (
            <NoSource result={result} />
          )}

          <AnimatePresence>
            {note && (
              <motion.p
                key={note}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 text-[13px] text-mist-500"
              >
                {note}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <Button variant="subtle" size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" /> Analyze another link
        </Button>
      </div>
    </motion.section>
  );
}

function sourceKind(s) {
  if (s.type === "hls") return "HLS";
  if (s.type === "dash") return "DASH";
  return (s.container || "file").toUpperCase();
}

// Exact byte counts come from the server's Content-Length; stream sizes are estimated
// from the bitrate, so they carry a "~".
function sizeText(s) {
  return `${s.sizeEstimated ? "~" : ""}${formatBytes(s.size)}`;
}

function SourceDetails({ source }) {
  const parts = [];
  if (source.type === "file") parts.push(`${(source.container || "video").toUpperCase()} file`);
  if (source.type === "hls") parts.push(source.live ? "Live HLS stream" : "HLS stream");
  if (source.type === "dash") parts.push(source.live ? "Live DASH stream" : "DASH stream");
  if (source.height) parts.push(`${source.height}p`);
  if (source.size) parts.push(source.sizeEstimated ? `about ${formatBytes(source.size)} (estimated)` : formatBytes(source.size));
  if (source.duration && !source.live) parts.push(`${Math.round(source.duration / 60)} min`);
  if ((source.audioUrl || source.audioRep) && !source.live) parts.push("separate audio track");
  if (source.noAudio) parts.push("video only: no sound track was found");
  if (source.encryption === "AES-128") parts.push("AES-128 encrypted");
  return <p className="mt-2.5 font-mono text-[11px] leading-relaxed text-mist-500">{parts.join(" · ")}</p>;
}

const NO_SOURCE_COPY = {
  drm: { icon: Lock, title: "This video is DRM-protected", tone: "live" },
  needs_session: { icon: Lock, title: "Only the site's own player can load this video" },
  needs_login: { icon: Lock, title: "This page needs a sign-in" },
  forbidden: { icon: Lock, title: "Access to the video was refused" },
  expired: { icon: Clock, title: "This video link has expired" },
  live: { icon: Clock, title: "Live stream, not downloadable" },
  bot_check: { icon: ShieldCheck, title: "The site blocked automated access" },
  unsupported: { icon: SearchX, title: "This video format isn't supported" },
  not_media: { icon: SearchX, title: "That link isn't a video we can read" },
  blocked: { icon: Lock, title: "That address isn't allowed" },
  no_video: { icon: SearchX, title: "No video found on this page" },
};

function NoSource({ result }) {
  const { url } = result;
  const reason = result.reason || (result.drm ? "drm" : "no_video");
  const copy = NO_SOURCE_COPY[reason] ?? NO_SOURCE_COPY.no_video;
  const Icon = copy.icon;
  const drm = copy.tone === "live";
  const message =
    result.message ||
    (result.drm
      ? "It's locked by the provider, so it can't be downloaded or played outside their site."
      : "No video was found on this page. If this is a show or movie listing, open the original site, choose an episode and server, wait for its player page to load, then paste that page's URL here. You can also paste a direct video link. Some sites don't make their video available for detection.");
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
          <p className="font-semibold">{copy.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-mist-500">{message}</p>
          {result.checked?.candidates > 0 && (
            <p className="mt-2 font-mono text-[11px] text-mist-700">
              {result.checked.candidates} possible video {result.checked.candidates === 1 ? "address" : "addresses"} checked
            </p>
          )}
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

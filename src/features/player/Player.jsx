import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  Captions,
  Check,
  ChevronDown,
  ExternalLink,
  Gauge,
  ListVideo,
  Maximize,
  Maximize2,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  ShieldCheck,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { LiveDot } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { attachSource, canUseRelay, formatTime } from "./engine";
import { reportError } from "@/lib/monitoring";
import { setWatching } from "@/features/account/PresenceReporter";
import { loadSubtitle } from "./subtitles";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIDE_AFTER_MS = 2800;
const SEEK_STEP = 10;
const ease = [0.22, 1, 0.36, 1];
// Phones and tablets: turning sideways means "watch full screen".
const touchLandscape = () => window.matchMedia("(orientation: landscape) and (pointer: coarse)");

/**
 * Full-screen, ad-free cinema player for a detected live stream. `mini` shrinks the same player
 * (same video, no reload) to a small card at the top of the screen, so the live keeps playing
 * while the viewer uses the rest of the app.
 */
export function Player({
  result,
  source: initialSource,
  resumeAt: resumeFrom,
  onClose,
  streamTitle,
  streams,
  activeStreamId,
  onSelectStream,
  mini = false,
  onMinimize,
  onExpand,
}) {
  const videoRef = useRef(null);
  const shellRef = useRef(null);
  const engineRef = useRef(null);
  const rotatedIn = useRef(false); // full screen was entered by turning the phone
  const resumeAt = useRef(resumeFrom || 0);
  const hideTimer = useRef(null);
  const lastTap = useRef({ t: 0, side: null });

  const [source, setSource] = useState(initialSource);
  const [mode, setMode] = useState("direct");
  const firstSource = useRef(initialSource);
  useEffect(() => {
    // The parent switched to another stream: play it in this same player.
    if (firstSource.current === initialSource) return;
    firstSource.current = initialSource;
    setSource(initialSource);
    setMode("direct");
    resumeAt.current = 0;
  }, [initialSource]);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = Number(safeGet("dw-volume") ?? 1);
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 1;
  });
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState([]);
  const [level, setLevel] = useState({ index: -1, auto: true });
  const [controls, setControls] = useState(true);
  const [menu, setMenu] = useState(null); // "quality" | "speed" | null
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null); // seek / play feedback bubble
  const [streamSubs, setStreamSubs] = useState([]); // subtitles inside an HLS stream
  const [subtitle, setSubtitle] = useState(null); // active track id, null = off
  const [subLoading, setSubLoading] = useState(false);
  const [resumedAt, setResumedAt] = useState(resumeFrom > 0 ? resumeFrom : null);

  const live = Boolean(source.live) || duration === Infinity;
  const fileSources = result.sources.filter((s) => s.type === source.type && !s.live && s.id !== undefined);

  /* ---------- attach / re-attach on source or mode change ---------- */
  useEffect(() => {
    const video = videoRef.current;
    let cancelled = false;
    setError(null);
    setWaiting(true);
    setLevels([]);

    setStreamSubs([]);
    attachSource(video, source, mode, {
      onLevels: setLevels,
      onSubtitleTracks: setStreamSubs,
      onLevelSwitch: (index, auto) => setLevel({ index, auto }),
      onFatal: (kind) => {
        if (cancelled) return;
        if (mode === "direct" && canUseRelay(source) && kind !== "unsupported") {
          resumeAt.current = video.currentTime || resumeAt.current;
          setMode("relay"); // the source blocks other sites: go through the Dixon server
        } else {
          reportError(new Error(`Playback failed: ${kind}`), { where: "player", type: source.type, mode, live: Boolean(source.live) });
          setError(
            kind === "unsupported"
              ? "This browser can't play this video format."
              : "The video source stopped responding. It may be offline or blocking playback.",
          );
          setWaiting(false);
        }
      },
    }).then((engine) => {
      if (cancelled) engine.destroy();
      else engineRef.current = engine;
    });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [source, mode]);

  /* ---------- video element events ---------- */
  useEffect(() => {
    const v = videoRef.current;
    v.volume = volume;
    const on = {
      loadedmetadata: () => {
        setDuration(v.duration);
        if (resumeAt.current && Number.isFinite(v.duration)) v.currentTime = resumeAt.current;
        resumeAt.current = 0;
        v.play().catch(() => setPlaying(false));
      },
      durationchange: () => setDuration(v.duration),
      timeupdate: () => {
        setTime(v.currentTime);
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
      },
      progress: () => v.buffered.length && setBuffered(v.buffered.end(v.buffered.length - 1)),
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      waiting: () => setWaiting(true),
      playing: () => setWaiting(false),
      canplay: () => setWaiting(false),
      volumechange: () => setMuted(v.muted),
      ratechange: () => setRate(v.playbackRate),
    };
    Object.entries(on).forEach(([e, fn]) => v.addEventListener(e, fn));
    return () => Object.entries(on).forEach(([e, fn]) => v.removeEventListener(e, fn));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- presence: tell the admin view what's playing ---------- */
  useEffect(() => {
    setWatching({ title: streamTitle || result.title, live: Boolean(result.live), site: result.site });
    return () => setWatching(null);
  }, [streamTitle, result.title, result.live, result.site]);

  useEffect(() => {
    if (!resumedAt) return;
    const t = setTimeout(() => setResumedAt(null), 6000);
    return () => clearTimeout(t);
  }, [resumedAt]);

  /* ---------- subtitles ---------- */
  const pageSubs = (result.subtitles ?? []).map((s, i) => ({ ...s, id: `page-${i}` }));
  const subOptions = [...streamSubs, ...pageSubs];

  const chooseSubtitle = async (id) => {
    setMenu(null);
    setSubtitle(id);
    const v = videoRef.current;
    const hls = engineRef.current?.hls;
    if (hls) hls.subtitleTrack = id?.startsWith("hls-") ? Number(id.slice(4)) : -1;
    // Page subtitle files are added as <track> elements on demand.
    for (const t of v.textTracks) t.mode = "disabled";
    const sub = pageSubs.find((s) => s.id === id);
    if (!sub) return;
    let el = v.querySelector(`track[data-id="${sub.id}"]`);
    if (!el) {
      setSubLoading(true);
      try {
        el = document.createElement("track");
        el.kind = "subtitles";
        el.label = sub.label;
        el.srclang = sub.lang || "en";
        el.dataset.id = sub.id;
        el.src = await loadSubtitle(sub);
        v.appendChild(el);
      } catch {
        setSubtitle(null);
        return;
      } finally {
        setSubLoading(false);
      }
    }
    el.track.mode = "showing";
  };

  /* ---------- controls auto-hide ---------- */
  const poke = useCallback(() => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused) {
        setControls(false);
        setMenu(null);
      }
    }, HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    if (!playing) setControls(true);
    else poke();
  }, [playing, poke]);

  /* ---------- actions ---------- */
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
    setFlash({ id: Date.now(), icon: v.paused ? "play" : "pause" });
  }, []);

  const seekBy = useCallback((delta) => {
    const v = videoRef.current;
    if (!Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(v.duration - 0.5, v.currentTime + delta));
    setFlash({ id: Date.now(), icon: delta > 0 ? "fwd" : "back" });
  }, []);

  const setVol = useCallback((value) => {
    const v = videoRef.current;
    const next = Math.max(0, Math.min(1, value));
    v.volume = next;
    v.muted = next === 0;
    setVolume(next);
    safeSet("dw-volume", String(next));
  }, []);

  const toggleFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (shellRef.current.requestFullscreen) {
      shellRef.current
        .requestFullscreen({ navigationUI: "hide" })
        // On a phone held upright, turn the picture sideways too (Android; ignored elsewhere).
        .then(() => window.matchMedia("(pointer: coarse)").matches && screen.orientation?.lock?.("landscape").catch(() => {}))
        .catch(() => {});
    } else v.webkitEnterFullscreen?.(); // iPhone
  }, []);

  /* ---------- turn the phone sideways: full screen; upright again: back ---------- */
  useEffect(() => {
    if (mini) return;
    const mq = touchLandscape();
    const onTurn = () => {
      if (mq.matches && !document.fullscreenElement) {
        // Browsers may refuse full screen without a tap; the player already fills the screen then.
        shellRef.current
          ?.requestFullscreen?.({ navigationUI: "hide" })
          .then(() => (rotatedIn.current = true))
          .catch(() => {});
      } else if (!mq.matches && rotatedIn.current && document.fullscreenElement) {
        rotatedIn.current = false;
        document.exitFullscreen().catch(() => {});
      }
    };
    mq.addEventListener("change", onTurn);
    return () => mq.removeEventListener("change", onTurn);
  }, [mini]);

  // Shrinking to the mini player leaves full screen first.
  useEffect(() => {
    if (mini && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (mini) setMenu(null);
  }, [mini]);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* not allowed / not supported */
    }
  }, []);

  const goLive = () => {
    const v = videoRef.current;
    const hls = engineRef.current?.hls;
    if (hls?.liveSyncPosition) v.currentTime = hls.liveSyncPosition;
    else if (v.seekable.length) v.currentTime = v.seekable.end(v.seekable.length - 1) - 2;
    v.play().catch(() => {});
  };

  const chooseLevel = (index) => {
    engineRef.current?.setLevel(index); // -1 = adaptive (HLS and DASH)
    setLevel({ index, auto: index === -1 });
    setMenu(null);
  };

  const chooseSource = (s) => {
    resumeAt.current = videoRef.current.currentTime;
    setSource(s);
    setMenu(null);
  };

  const retry = () => {
    resumeAt.current = videoRef.current.currentTime;
    setError(null);
    setMode("direct");
    setSource((s) => ({ ...s }));
  };

  /* ---------- fullscreen state ---------- */
  useEffect(() => {
    const onFs = () => {
      const on = Boolean(document.fullscreenElement);
      setFullscreen(on);
      if (!on) {
        rotatedIn.current = false;
        screen.orientation?.unlock?.();
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ---------- keyboard and scroll lock: full-screen player only ---------- */
  useEffect(() => {
    if (mini) return;
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea")) return;
      const v = videoRef.current;
      const map = {
        " ": togglePlay,
        k: togglePlay,
        ArrowRight: () => seekBy(SEEK_STEP),
        l: () => seekBy(SEEK_STEP),
        ArrowLeft: () => seekBy(-SEEK_STEP),
        j: () => seekBy(-SEEK_STEP),
        ArrowUp: () => setVol(v.volume + 0.1),
        ArrowDown: () => setVol(v.volume - 0.1),
        m: () => (v.muted = !v.muted),
        f: toggleFullscreen,
        p: togglePip,
        Escape: () => !document.fullscreenElement && minimize(),
      };
      const action = map[e.key];
      if (action) {
        e.preventDefault();
        action();
        poke();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mini, togglePlay, seekBy, setVol, toggleFullscreen, togglePip, poke]);

  // Without a mini player to go to (no onMinimize), "minimize" closes.
  const minimize = () => (onMinimize ? onMinimize() : onClose());

  /* ---------- taps: tap = controls, double-tap sides = ±10s (touch) ---------- */
  function onSurfacePointerUp(e) {
    if (mini) return onExpand?.(); // tap the mini player: back to full screen
    if (menu) return setMenu(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX - rect.left < rect.width / 3 ? "left" : e.clientX - rect.left > (rect.width * 2) / 3 ? "right" : "center";
    const now = Date.now();
    const isDouble = now - lastTap.current.t < 300 && lastTap.current.side === side;
    lastTap.current = { t: now, side };

    if (e.pointerType === "mouse") {
      if (isDouble) toggleFullscreen();
      else togglePlay();
      return;
    }
    if (isDouble && side !== "center" && !live) seekBy(side === "left" ? -SEEK_STEP : SEEK_STEP);
    else if (controls) setControls(false);
    else poke();
  }

  const atLiveEdge = live && (() => {
    const v = videoRef.current;
    if (!v?.seekable.length) return true;
    return v.seekable.end(v.seekable.length - 1) - time < 12;
  })();

  const [a, b] = result.palette ?? ["#c6ff3d", "#0f7b5f"];
  const currentHeight = level.index >= 0 ? levels[level.index]?.height : null;
  const qualityLabel = levels.length > 1 ? (level.auto ? `Auto${currentHeight ? ` · ${currentHeight}p` : ""}` : `${currentHeight}p`) : source.quality;

  const title = streamTitle || result.title;

  return createPortal(
    <motion.div
      ref={shellRef}
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ layout: { duration: 0.32, ease } }}
      className={cn(
        "overflow-hidden bg-black select-none",
        mini
          ? // The mini player: a small card at the top, under the phone's top bar.
            "fixed top-[calc(3.5rem+env(safe-area-inset-top)+.5rem)] right-3 z-[95] aspect-video w-[min(62vw,320px)] cursor-pointer rounded-2xl shadow-2xl shadow-black/70 ring-1 ring-white/15 lg:top-5 lg:right-5 lg:w-[380px]"
          : "fixed inset-0 z-[110]",
        !mini && !controls && playing && "cursor-none",
      )}
      onPointerMove={(e) => !mini && e.pointerType === "mouse" && poke()}
      role={mini ? "region" : "dialog"}
      aria-label={mini ? `Mini player: ${title}` : `Playing ${title}`}
    >
      {/* Ambient light in the letterbox, from the poster's colours */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: `radial-gradient(50% 60% at 15% 50%, ${a}26, transparent 70%), radial-gradient(50% 60% at 85% 50%, ${b}33, transparent 70%)` }}
      />

      <video ref={videoRef} className="absolute inset-0 size-full object-contain" playsInline autoPlay />

      {/* Tap / click surface */}
      <div className="absolute inset-0" onPointerUp={onSurfacePointerUp} />

      {mini && <MiniControls title={title} live={live} playing={playing} error={error} onTogglePlay={togglePlay} onExpand={onExpand} onClose={onClose} />}

      {/* Centre: buffering, big play, seek feedback */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {waiting && !error && <Spinner className={mini ? "size-7 border-2 text-signal" : "size-12 border-[3px] text-signal"} />}
        {!mini && !playing && !waiting && !error && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={togglePlay}
            aria-label="Play"
            className="pointer-events-auto grid size-20 place-items-center rounded-full bg-signal text-ink-950 shadow-[0_0_60px_-10px_rgb(198_255_61/.8)] transition hover:scale-105"
          >
            <Play className="ml-1 size-8" fill="currentColor" />
          </motion.button>
        )}
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.id}
              initial={{ opacity: 0.9, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.3 }}
              transition={{ duration: 0.55 }}
              onAnimationComplete={() => setFlash(null)}
              className="absolute grid size-20 place-items-center rounded-full bg-black/50 backdrop-blur"
            >
              {flash.icon === "fwd" && <span className="font-mono text-sm font-medium">+{SEEK_STEP}s</span>}
              {flash.icon === "back" && <span className="font-mono text-sm font-medium">−{SEEK_STEP}s</span>}
              {flash.icon === "play" && <Play className="size-7" fill="currentColor" />}
              {flash.icon === "pause" && <Pause className="size-7" fill="currentColor" />}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && !mini && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="max-w-sm text-center">
            <p className="font-display text-xl font-bold">Playback stopped</p>
            <p className="mt-2 text-sm text-mist-300">{error}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button onClick={retry} className="inline-flex h-11 items-center gap-2 rounded-full bg-signal px-5 text-sm font-semibold text-ink-950">
                <RotateCcw className="size-4" /> Try again
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="glass inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"
              >
                Open original <ExternalLink className="size-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* "Resumed at 42:10 · Start over" */}
      <AnimatePresence>
        {resumedAt && !error && !mini && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="glass-strong absolute bottom-28 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-sm"
          >
            <span className="text-mist-300">
              Resumed at <span className="font-mono text-mist-100">{formatTime(resumedAt)}</span>
            </span>
            <button
              onClick={() => {
                videoRef.current.currentTime = 0;
                resumeAt.current = 0;
                setResumedAt(null);
              }}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold transition hover:bg-white/20"
            >
              Start over
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      {!mini && (
        <motion.div
          animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : -12 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "absolute inset-x-0 top-0 flex items-start gap-3 bg-gradient-to-b from-black/80 via-black/30 to-transparent px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16 sm:px-6",
            !controls && "pointer-events-none",
          )}
        >
          <button
            onClick={minimize}
            aria-label={onMinimize ? "Minimize: keep watching in a small player" : "Close player"}
            title={onMinimize ? "Minimize (Esc)" : "Close"}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20"
          >
            <ChevronDown className="size-5" />
          </button>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="flex items-center gap-2 font-display text-[17px] font-bold tracking-tight sm:text-xl">
              {live && <LiveDot />}
              <span className="truncate">{streamTitle || result.title}</span>
            </p>
            <p className="truncate text-xs text-mist-300">
              {[streamTitle && streamTitle !== result.title ? result.title : result.year, result.site].filter(Boolean).join(" · ")}
              {mode === "relay" && " · via Dixon server"}
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-signal/15 px-3 py-1.5 font-mono text-[11px] font-medium text-signal ring-1 ring-signal/30 backdrop-blur sm:inline-flex">
            <ShieldCheck className="size-3.5" /> No ads · {result.adsBlocked} blocked
          </span>
          {onMinimize && (
            <button onClick={onClose} aria-label="Close player" title="Close" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20">
              <X className="size-5" />
            </button>
          )}
        </motion.div>
      )}

      {/* Bottom controls */}
      {!mini && (
        <motion.div
          animate={{ opacity: controls ? 1 : 0, y: controls ? 0 : 12 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-20 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6",
            !controls && "pointer-events-none",
          )}
        >
          {!live && <Scrubber time={time} duration={duration} buffered={buffered} onSeek={(t) => (videoRef.current.currentTime = t)} />}

          <div className="mt-2 flex items-center gap-1 sm:gap-2">
            <CtrlButton label={playing ? "Pause (k)" : "Play (k)"} onClick={togglePlay}>
              {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5" fill="currentColor" />}
            </CtrlButton>
            {!live && (
              <>
                <CtrlButton label="Back 10s (j)" onClick={() => seekBy(-SEEK_STEP)}>
                  <RotateCcw className="size-5" />
                </CtrlButton>
                <CtrlButton label="Forward 10s (l)" onClick={() => seekBy(SEEK_STEP)}>
                  <RotateCw className="size-5" />
                </CtrlButton>
              </>
            )}

            <VolumeControl volume={muted ? 0 : volume} onChange={setVol} onToggleMute={() => (videoRef.current.muted = !videoRef.current.muted)} />

            {live ? (
              <button
                onClick={goLive}
                className={cn(
                  "ml-1 inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-medium tracking-wider uppercase ring-1 transition",
                  atLiveEdge ? "bg-live/15 text-live ring-live/30" : "bg-white/10 text-mist-300 ring-white/15 hover:text-mist-100",
                )}
              >
                {atLiveEdge ? <LiveDot /> : <span className="size-2 rounded-full bg-mist-500" />}
                {atLiveEdge ? "Live" : "Go live"}
              </button>
            ) : (
              <span className="ml-1 font-mono text-[12px] text-mist-300 tabular-nums">
                {formatTime(time)} <span className="text-mist-500">/ {formatTime(duration)}</span>
              </span>
            )}

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              {streams?.length > 1 && (
                <Menu
                  open={menu === "streams"}
                  onToggle={() => setMenu((m) => (m === "streams" ? null : "streams"))}
                  label="Streams on this page"
                  trigger={
                    <>
                      <ListVideo className="size-5" />
                      <span className="hidden font-mono text-[11px] sm:inline">{streams.length} streams</span>
                    </>
                  }
                >
                  <div className="max-h-[50dvh] min-w-56 overflow-y-auto">
                    {streams.map((st) => (
                      <MenuItem
                        key={st.id}
                        active={st.id === activeStreamId}
                        onClick={() => {
                          setMenu(null);
                          onSelectStream?.(st.id);
                        }}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {st.live && <LiveDot />}
                          <span className="truncate">{st.title}</span>
                        </span>
                      </MenuItem>
                    ))}
                  </div>
                </Menu>
              )}

              {subOptions.length > 0 && (
                <Menu
                  open={menu === "subs"}
                  onToggle={() => setMenu((m) => (m === "subs" ? null : "subs"))}
                  label="Subtitles"
                  trigger={
                    subLoading ? (
                      <Spinner className="size-4" />
                    ) : (
                      <Captions className={cn("size-5", subtitle && "text-signal")} />
                    )
                  }
                >
                  <MenuItem active={!subtitle} onClick={() => chooseSubtitle(null)}>
                    Off
                  </MenuItem>
                  {subOptions.map((s) => (
                    <MenuItem key={s.id} active={subtitle === s.id} onClick={() => chooseSubtitle(s.id)}>
                      {s.label}
                    </MenuItem>
                  ))}
                </Menu>
              )}

              {!live && (
                <Menu
                  open={menu === "speed"}
                  onToggle={() => setMenu((m) => (m === "speed" ? null : "speed"))}
                  label="Playback speed"
                  trigger={
                    <>
                      <Gauge className="size-5" />
                      <span className="hidden font-mono text-[11px] sm:inline">{rate}×</span>
                    </>
                  }
                >
                  {SPEEDS.map((s) => (
                    <MenuItem key={s} active={rate === s} onClick={() => ((videoRef.current.playbackRate = s), setMenu(null))}>
                      {s === 1 ? "Normal" : `${s}×`}
                    </MenuItem>
                  ))}
                </Menu>
              )}

              {(levels.length > 1 || fileSources.length > 1) && (
                <Menu
                  open={menu === "quality"}
                  onToggle={() => setMenu((m) => (m === "quality" ? null : "quality"))}
                  label="Quality"
                  trigger={
                    <>
                      <Settings2 className="size-5" />
                      <span className="hidden font-mono text-[11px] sm:inline">{qualityLabel}</span>
                    </>
                  }
                >
                  {levels.length > 1 ? (
                    <>
                      <MenuItem active={level.auto} onClick={() => chooseLevel(-1)}>
                        Auto
                      </MenuItem>
                      {[...levels]
                        .sort((x, y) => y.height - x.height)
                        .map((l) => (
                          <MenuItem key={l.index} active={!level.auto && level.index === l.index} onClick={() => chooseLevel(l.index)}>
                            {l.height}p
                          </MenuItem>
                        ))}
                    </>
                  ) : (
                    fileSources.map((s) => (
                      <MenuItem key={s.id} active={s.id === source.id} onClick={() => chooseSource(s)}>
                        {s.quality}
                      </MenuItem>
                    ))
                  )}
                </Menu>
              )}

              {typeof document !== "undefined" && document.pictureInPictureEnabled && (
                <CtrlButton label="Picture in picture (p)" onClick={togglePip}>
                  <PictureInPicture2 className="size-5" />
                </CtrlButton>
              )}
              <CtrlButton label={fullscreen ? "Exit full screen (f)" : "Full screen (f)"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </CtrlButton>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>,
    document.body,
  );
}

/* ---------- pieces ---------- */

/** On top of the mini player: what's playing, play/pause, back to full screen, close. */
function MiniControls({ title, live, playing, error, onTogglePlay, onExpand, onClose }) {
  const tap = (fn) => (e) => {
    e.stopPropagation();
    fn?.();
  };
  const round = "pointer-events-auto grid size-8 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 active:scale-95";
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between bg-gradient-to-b from-black/55 via-transparent to-black/55 p-1.5">
      <div className="flex items-start justify-between gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 text-[11px] leading-none font-semibold backdrop-blur">
          {live && <LiveDot />}
          <span className="truncate">{error ? "Playback stopped" : title}</span>
        </span>
        <button onClick={tap(onClose)} aria-label="Close player" title="Close" className={round}>
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-end justify-between">
        <button onClick={tap(onTogglePlay)} aria-label={playing ? "Pause" : "Play"} className={round}>
          {playing ? <Pause className="size-3.5" fill="currentColor" /> : <Play className="ml-px size-3.5" fill="currentColor" />}
        </button>
        <button onClick={tap(onExpand)} aria-label="Full screen player" title="Back to full screen" className={round}>
          <Maximize2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function CtrlButton({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-10 place-items-center rounded-full text-mist-100 transition hover:bg-white/10 active:scale-95"
    >
      {children}
    </button>
  );
}

function Scrubber({ time, duration, buffered, onSeek }) {
  const barRef = useRef(null);
  const [hover, setHover] = useState(null); // { x, t }
  const [drag, setDrag] = useState(null);
  const shown = drag ?? time;
  const pct = (v) => (duration > 0 ? `${Math.min(100, (v / duration) * 100)}%` : "0%");

  const timeAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return { x: ratio * r.width, t: ratio * duration };
  };

  return (
    <div
      ref={barRef}
      className="group relative flex h-5 cursor-pointer items-center"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(timeAt(e.clientX).t);
      }}
      onPointerMove={(e) => {
        const at = timeAt(e.clientX);
        setHover(at);
        if (drag !== null) setDrag(at.t);
      }}
      onPointerUp={(e) => {
        if (drag !== null) onSeek(timeAt(e.clientX).t);
        setDrag(null);
      }}
      onPointerLeave={() => setHover(null)}
      role="slider"
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration) || 0}
      aria-valuenow={Math.round(time)}
    >
      <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/15 transition-all group-hover:h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: pct(buffered) }} />
        <div className="absolute inset-y-0 left-0 bg-signal" style={{ width: pct(shown) }} />
      </div>
      <div
        className="absolute size-3.5 -translate-x-1/2 rounded-full bg-signal shadow-[0_0_14px_rgb(198_255_61/.8)] transition-transform group-hover:scale-110"
        style={{ left: pct(shown) }}
      />
      {hover && (
        <div
          className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md bg-black/80 px-2 py-1 font-mono text-[11px] tabular-nums backdrop-blur"
          style={{ left: hover.x }}
        >
          {formatTime(hover.t)}
        </div>
      )}
    </div>
  );
}

function VolumeControl({ volume, onChange, onToggleMute }) {
  const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="group/vol flex items-center">
      <CtrlButton label="Mute (m)" onClick={onToggleMute}>
        <Icon className="size-5" />
      </CtrlButton>
      <input
        type="range"
        min={0}
        max={1}
        step={0.02}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Volume"
        className="hidden h-1 w-0 cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--color-signal)] transition-all duration-200 group-hover/vol:w-24 sm:block"
      />
    </div>
  );
}

function Menu({ open, onToggle, label, trigger, children }) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={cn("flex h-10 items-center gap-1.5 rounded-full px-2.5 text-mist-100 transition hover:bg-white/10", open && "bg-white/10")}
      >
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute right-0 bottom-12 min-w-36 overflow-hidden rounded-2xl p-1.5 shadow-2xl shadow-black/60"
          >
            <p className="px-3 pt-1.5 pb-1 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">{label}</p>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-6 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/[.08]",
        active ? "text-signal" : "text-mist-100",
      )}
    >
      {children}
      {active && <Check className="size-4" />}
    </button>
  );
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

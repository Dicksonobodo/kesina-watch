import { canRelay, relayMirrorUrl, relayUrl } from "@/lib/relay";

/**
 * Connects a <video> to a detected source.
 * - File (MP4/WebM…): plain <video src> (no CORS needed to play).
 * - HLS: hls.js where available, otherwise the browser's own HLS (Safari / iOS). A video
 *   playlist with a separate audio playlist (no master) gets a small master built here, so
 *   the sound plays too.
 * - DASH: dash.js (loaded only when needed).
 * - mode "relay": everything goes through the Dixon server, for sources that block other sites.
 *
 * Calls onFatal(kind) when playback can't continue so the caller can switch to the relay.
 * Returns { hls, setLevel(index), destroy() }; index -1 = adaptive.
 */
// Which attach currently owns each <video>: a stale attach must never touch the element.
const owners = new WeakMap();
let attachCount = 0;

export async function attachSource(video, source, mode, handlers) {
  const id = ++attachCount;
  owners.set(video, id);
  const isCurrent = () => owners.get(video) === id;

  // Chrome reports a refused file request (403 without its Referer, etc.) as "format not
  // supported" (code 4). For files played directly, try the relay before believing that.
  const onVideoError = () => {
    if (!isCurrent()) return;
    const refusedOrUnsupported = video.error?.code === 4;
    handlers.onFatal(refusedOrUnsupported && !(mode === "direct" && source.type === "file") ? "unsupported" : "network");
  };
  video.addEventListener("error", onVideoError);
  const cleanups = [() => video.removeEventListener("error", onVideoError)];
  const finish = (extra = {}) => ({
    hls: null,
    setLevel: () => {},
    ...extra,
    destroy() {
      cleanups.forEach((fn) => fn());
      if (!isCurrent()) return; // a newer attach has already taken over the element
      owners.delete(video);
      video.removeAttribute("src");
      video.load();
    },
  });

  if (source.type === "dash") return attachDash(video, source, mode, handlers, { isCurrent, cleanups, finish });
  if (source.type === "hls") return attachHls(video, source, mode, handlers, { isCurrent, cleanups, finish });

  video.src = mode === "relay" ? relayUrl(source, source.url) : source.url;
  return finish();
}

/* ---------- HLS ---------- */

// Video and audio found as two separate playlists: describe them in a one-quality master
// so hls.js plays both. URLs are absolute (and relayed when needed).
function pairedMaster(source, wrap) {
  const text = [
    "#EXTM3U",
    "#EXT-X-VERSION:6",
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${wrap(source.audioUrl)}"`,
    `#EXT-X-STREAM-INF:BANDWIDTH=${source.bandwidth || 2_000_000}${source.height ? `,RESOLUTION=${Math.round((source.height * 16) / 9)}x${source.height}` : ""},AUDIO="aud"`,
    wrap(source.url),
    "",
  ].join("\n");
  return URL.createObjectURL(new Blob([text], { type: "application/vnd.apple.mpegurl" }));
}

async function attachHls(video, source, mode, { onLevels, onLevelSwitch, onFatal, onSubtitleTracks = () => {} }, { isCurrent, cleanups, finish }) {
  const wrap = (u) => (mode === "relay" ? relayUrl(source, u, { rewrite: true }) : u);
  let url;
  if (source.masterUrl) url = wrap(source.masterUrl);
  else if (source.audioUrl) {
    url = pairedMaster(source, wrap);
    cleanups.push(() => URL.revokeObjectURL(url));
  } else url = wrap(source.url);

  const { default: Hls } = await import("hls.js");
  if (!isCurrent()) return finish();
  if (Hls.isSupported()) {
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: Boolean(source.live),
      backBufferLength: 90,
      maxBufferLength: 45,
    });
    let mediaRecoveries = 0;
    hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
      const levels = data.levels.map((l, i) => ({ index: i, height: l.height, bitrate: l.bitrate }));
      onLevels(levels);
      // Start at the quality the user picked; adaptive switching stays on.
      const preferred = levels.findIndex((l) => l.height === source.height);
      if (preferred >= 0) hls.startLevel = preferred;
    });
    // Subtitles carried inside the stream (EXT-X-MEDIA TYPE=SUBTITLES).
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_e, data) =>
      onSubtitleTracks(data.subtitleTracks.map((t, i) => ({ id: `hls-${i}`, index: i, label: t.name || t.lang || `Track ${i + 1}`, lang: t.lang || "" }))),
    );
    hls.subtitleDisplay = true;
    hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => onLevelSwitch(data.level, hls.autoLevelEnabled));
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (!data.fatal || !isCurrent()) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries++ < 2) return hls.recoverMediaError();
      onFatal(data.type === Hls.ErrorTypes.NETWORK_ERROR ? "network" : "media");
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    cleanups.push(() => hls.destroy());
    return finish({
      hls,
      setLevel: (index) => {
        hls.currentLevel = index; // -1 = adaptive
      },
    });
  }
  if (video.canPlayType("application/vnd.apple.mpegurl") && !source.audioUrl) video.src = url;
  else onFatal("unsupported");
  return finish();
}

/* ---------- DASH ---------- */

async function attachDash(video, source, mode, { onLevels, onLevelSwitch, onFatal }, { isCurrent, cleanups, finish }) {
  const mod = await import("dashjs");
  const dashjs = mod.default ?? mod;
  if (!isCurrent()) return finish();
  if (!dashjs.supportsMediaSource()) {
    onFatal("unsupported");
    return finish();
  }

  // Relay mode: the manifest is loaded from a mirror-style relay address, so its relative
  // segment addresses resolve into the relay too; absolute ones are rewritten below.
  const url = mode === "relay" ? relayMirrorUrl(source, source.url) : source.url;

  const player = dashjs.MediaPlayer().create();
  const events = dashjs.MediaPlayer.events;
  player.updateSettings({
    debug: { logLevel: dashjs.Debug.LOG_LEVEL_NONE },
    streaming: {
      buffer: { bufferTimeAtTopQuality: 30, bufferToKeep: 60 },
      // Start near the quality the user picked; adaptive switching stays on.
      abr: { initialBitrate: { video: source.bandwidth ? Math.round(source.bandwidth / 1000) : -1 }, autoSwitchBitrate: { video: true } },
    },
  });
  if (mode === "relay") {
    player.extend(
      "RequestModifier",
      () => ({
        modifyRequestURL: (u) => (/^https?:/i.test(u) ? relayMirrorUrl(source, u) : u),
        modifyRequestHeader: (xhr) => xhr,
      }),
      true,
    );
  }

  player.on(events.STREAM_INITIALIZED, () => {
    const list = player.getBitrateInfoListFor("video") || [];
    onLevels(list.map((b) => ({ index: b.qualityIndex, height: b.height, bitrate: b.bitrate })));
  });
  player.on(events.QUALITY_CHANGE_RENDERED, (e) => {
    if (e.mediaType === "video") onLevelSwitch(e.newQuality, player.getSettings().streaming.abr.autoSwitchBitrate.video);
  });
  player.on(events.ERROR, (e) => {
    if (!isCurrent()) return;
    const code = e?.error?.code;
    // Manifest / segment download failures can be fixed by the relay; media-source capability
    // and type errors mean this browser can't play the format.
    onFatal([11, 15, 17, 25, 26, 27, 28, 29].includes(code) ? "network" : [23, 35].includes(code) ? "unsupported" : "media");
  });
  player.initialize(video, url, true);
  cleanups.unshift(() => player.reset());

  return finish({
    setLevel: (index) => {
      const auto = index === -1;
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: auto } } } });
      if (!auto) player.setQualityFor("video", index, true);
    },
  });
}

export const canUseRelay = canRelay;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

import { canRelay, relayUrl } from "@/features/downloads/engine/fetcher";

/**
 * Connects a <video> to a detected source.
 * - MP4: plain <video src> (no CORS needed to play).
 * - HLS: hls.js where available, otherwise the browser's own HLS (Safari / iOS).
 * - mode "relay": everything goes through the Dixon server, for sources that block other sites.
 *
 * Calls onFatal(kind) when playback can't continue so the caller can switch to the relay.
 */
// Which attach currently owns each <video>: a stale attach must never touch the element.
const owners = new WeakMap();
let attachCount = 0;

export async function attachSource(video, source, mode, { onLevels, onLevelSwitch, onFatal, onSubtitleTracks = () => {} }) {
  const id = ++attachCount;
  owners.set(video, id);
  const isCurrent = () => owners.get(video) === id;

  const playUrl = source.type === "hls" ? source.masterUrl || source.url : source.url;
  const url = mode === "relay" ? relayUrl(source, playUrl, { rewrite: source.type === "hls" }) : playUrl;

  const onVideoError = () => isCurrent() && onFatal(video.error?.code === 4 ? "unsupported" : "network");
  video.addEventListener("error", onVideoError);
  const cleanups = [() => video.removeEventListener("error", onVideoError)];

  const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");
  if (source.type !== "hls") {
    video.src = url;
  } else {
    const { default: Hls } = await import("hls.js");
    if (!isCurrent()) return { hls: null, destroy: () => cleanups.forEach((fn) => fn()) };
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
      return { hls, destroy: () => cleanups.forEach((fn) => fn()) };
    }
    if (nativeHls) video.src = url;
    else {
      onFatal("unsupported");
    }
  }

  return {
    hls: null,
    destroy() {
      cleanups.forEach((fn) => fn());
      if (!isCurrent()) return; // a newer attach has already taken over the element
      owners.delete(video);
      video.removeAttribute("src");
      video.load();
    },
  };
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

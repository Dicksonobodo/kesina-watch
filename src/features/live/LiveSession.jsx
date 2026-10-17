import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { AnimatePresence } from "motion/react";
import { useDetector } from "@/features/home/useDetector";

// Loaded the first time something plays, so other pages don't carry the player's code.
const Player = lazy(() => import("@/features/player/Player").then((m) => ({ default: m.Player })));

/*
 * Live lives in the app frame, not in the Live page: the link being scanned, the live it found
 * and the player all stay put while the viewer looks at other pages. The player shrinks to a
 * mini player at the top of the screen and grows back to full screen when tapped.
 */
const LiveSessionContext = createContext(null);

export function useLiveSession() {
  const value = useContext(LiveSessionContext);
  if (!value) throw new Error("useLiveSession must be used inside <LiveSessionProvider>");
  return value;
}

/* ---------- a page's streams and their qualities ---------- */

/** The streams a result offers (channels, cameras, feeds), each with its own title. */
export function streamsOf(result, liveOnly) {
  const list = result.streams?.length ? result.streams : [{ id: null, title: result.title, live: result.live }];
  return liveOnly ? list.filter((st) => st.live) : list;
}

/** The qualities of one stream, best first. */
export function sourcesOf(result, stream, liveOnly) {
  return result.sources.filter((s) => (s.streamId ?? null) === (stream?.id ?? null) && (!liveOnly || s.live));
}

export function LiveSessionProvider({ children }) {
  // A live that's found starts playing straight away (DetectionResult opens the player once).
  const detector = useDetector({ linksPath: "/live", autoplayOnFind: true });
  // What's playing: { result, liveOnly, streamId, sourceId, resumeAt } or null.
  const [now, setNow] = useState(null);
  const [view, setView] = useState("full"); // "full" | "mini"

  const play = useCallback(({ result, liveOnly = false, streamId = null, sourceId, resumeAt = 0 }) => {
    setNow((cur) =>
      // Already playing exactly this: just bring it back to full screen.
      cur && cur.result.url === result.url && cur.streamId === streamId && cur.sourceId === sourceId ? cur : { result, liveOnly, streamId, sourceId, resumeAt },
    );
    setView("full");
  }, []);

  const selectStream = useCallback((streamId) => {
    setNow((cur) => {
      if (!cur) return cur;
      const stream = streamsOf(cur.result, cur.liveOnly).find((st) => st.id === streamId);
      return stream ? { ...cur, streamId: stream.id, sourceId: sourcesOf(cur.result, stream, cur.liveOnly)[0]?.id, resumeAt: 0 } : cur;
    });
  }, []);

  const close = useCallback(() => setNow(null), []);
  const minimize = useCallback(() => setView("mini"), []);
  const expand = useCallback(() => setView("full"), []);

  const value = useMemo(
    () => ({ detector, now, view, play, selectStream, close, minimize, expand }),
    [detector, now, view, play, selectStream, close, minimize, expand],
  );

  return (
    <LiveSessionContext.Provider value={value}>
      {children}
      <NowPlaying />
    </LiveSessionContext.Provider>
  );
}

/** The one player, shown full screen or as the mini player, whichever page is open. */
function NowPlaying() {
  const { now, view, selectStream, close, minimize, expand } = useLiveSession();
  const { pathname } = useLocation();

  // Going to another page (the phone's Back button, say) while watching full screen keeps the
  // live playing in the mini player.
  useEffect(() => {
    minimize();
  }, [pathname, minimize]);

  const streams = now ? streamsOf(now.result, now.liveOnly) : [];
  const current = streams.find((st) => st.id === now?.streamId) ?? streams[0];
  const sources = now ? sourcesOf(now.result, current, now.liveOnly) : [];
  const source = sources.find((s) => s.id === now?.sourceId) ?? sources[0];
  const multi = streams.length > 1;

  return (
    <Suspense fallback={null}>
      <AnimatePresence>
        {now && source && (
          <Player
            key={now.result.url}
            result={now.result}
            source={source}
            resumeAt={now.resumeAt}
            streamTitle={multi || current?.title !== now.result.title ? current?.title : undefined}
            streams={multi ? streams : undefined}
            activeStreamId={current?.id}
            onSelectStream={selectStream}
            mini={view === "mini"}
            onMinimize={minimize}
            onExpand={expand}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </Suspense>
  );
}

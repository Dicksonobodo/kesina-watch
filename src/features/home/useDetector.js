import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShield } from "@/features/shield/ShieldProvider";
import { detectMovie } from "@/lib/api";
import { isHttpUrl } from "@/lib/format";

/**
 * Paste-a-link → detect → result, shared by Home and Live.
 * Also handles links into the page: ?u=<page>  (detect straight away),
 * &play=1 (open the player when found) and &t=<seconds> (resume position).
 */
export function useDetector() {
  const { record } = useShield();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("idle"); // idle | detecting | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [autoplay, setAutoplay] = useState(null); // { at: seconds } when a link asked to play
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const detect = useCallback(
    async (e, override) => {
      e?.preventDefault?.();
      const link = (override ?? url).trim();
      if (!isHttpUrl(link)) {
        setError("Paste a full link that starts with http:// or https://");
        setStatus("error");
        inputRef.current?.focus();
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("detecting");
      setError("");
      setResult(null);
      try {
        const data = await detectMovie(link, { signal: controller.signal });
        setResult(data);
        setStatus("done");
        record({ ads: data.adsBlocked, popups: data.popupsBlocked });
      } catch (err) {
        if (err.name === "AbortError") return;
        setError(err.message);
        setStatus("error");
      }
    },
    [url, record],
  );

  // A link into the page (?u=…). Watched by value, so it also works when you're already on the
  // page (a pinned live tapped on Live, say) and not only when the page first opens.
  const shared = searchParams.get("u");
  useEffect(() => {
    if (!shared) return;
    setUrl(shared);
    if (searchParams.get("play")) setAutoplay({ at: Number(searchParams.get("t")) || 0 });
    setSearchParams({}, { replace: true });
    detect(null, shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setStatus("idle");
    setResult(null);
    setError("");
    setUrl("");
    setAutoplay(null);
    inputRef.current?.focus();
  }, []);

  return { url, setUrl, status, setStatus, result, error, detect, reset, inputRef, autoplay };
}

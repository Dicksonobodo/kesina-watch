import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { detectMovie, isDemoApi } from "@/lib/api";
import { useShield } from "@/features/shield/ShieldProvider";
import { DetectionProgress } from "@/features/home/DetectionProgress";
import { DetectionResult } from "@/features/home/DetectionResult";

/**
 * Detects one movie from a Browse grid without leaving the grid: progress, then the usual
 * result (Download / Watch / Save). Closing returns to the exact scroll position.
 */
export function DetectSheet({ item, onClose }) {
  const link = item.link;
  const { record } = useShield();
  const [state, setState] = useState({ status: "detecting", result: null, error: "" });
  const abort = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abort.current = controller;
    detectMovie(link, { signal: controller.signal })
      .then((detected) => {
        // The grid already knows the poster and title; fill in whatever the movie page lacked.
        const result = {
          ...detected,
          poster: detected.poster ?? item.poster ?? null,
          title: !detected.title || detected.title === "Untitled" ? item.title : detected.title,
          year: detected.year ?? item.year ?? null,
        };
        setState({ status: "done", result, error: "" });
        record({ ads: result.adsBlocked, popups: result.popupsBlocked });
      })
      .catch((err) => err.name !== "AbortError" && setState({ status: "error", result: null, error: err.message }));
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link, record]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !document.querySelector("[aria-label^='Playing']") && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <motion.div className="fixed inset-0 z-[94] flex justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label="Movie"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="relative mt-auto max-h-[94dvh] w-full max-w-4xl overflow-y-auto rounded-t-[28px] bg-ink-950 p-4 ring-1 ring-white/10 sm:mt-0 sm:rounded-[28px] sm:p-6"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-white/[.08] transition hover:bg-white/[.14]"
        >
          <X className="size-4" />
        </button>
        {state.status === "detecting" && <DetectionProgress url={link} demo={isDemoApi} />}
        {state.status === "done" && <DetectionResult result={state.result} onReset={onClose} />}
        {state.status === "error" && (
          <div className="px-2 py-12 text-center">
            <p className="font-display text-xl font-bold">Couldn&apos;t open this one</p>
            <p className="mt-2 text-sm text-mist-500">{state.error}</p>
            <a href={link} target="_blank" rel="noopener noreferrer" className="mt-5 inline-block text-sm font-semibold text-mist-300 hover:text-signal">
              Open the original page ↗
            </a>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

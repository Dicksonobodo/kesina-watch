import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";

/*
 * "Round 2 done", the score, and what's next. Shown over a chat game when both players have had
 * their go in a round; it goes away by itself, or with a tap.
 */

export function RoundDone({ info, onClose }) {
  useEffect(() => {
    if (!info) return;
    const t = setTimeout(onClose, 3200);
    return () => clearTimeout(t);
  }, [info, onClose]);

  return (
    <AnimatePresence>
      {info && (
        <motion.button
          type="button"
          key={info.key}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-label="Continue"
          className="fixed inset-0 z-[140] grid place-items-center bg-black/60 p-6 backdrop-blur-sm"
        >
          <motion.div initial={{ scale: 0.85, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 22 }} className="w-full max-w-xs rounded-3xl bg-ink-900/95 p-5 text-center ring-1 ring-white/15">
            {info.eyebrow && <p className="font-mono text-[10px] tracking-[.24em] text-white/55 uppercase">{info.eyebrow}</p>}
            <p className="mt-1 font-display text-3xl font-black tracking-tight italic">{info.title}</p>
            <div className="mt-3 flex items-center justify-center gap-3">
              {info.score.map((s, i) => (
                <span key={i} className="flex flex-col items-center">
                  <span className={cn("max-w-[7rem] truncate text-xs font-bold", s.me ? "text-signal" : "text-white/80")}>{s.name}</span>
                  <span className="font-display text-3xl leading-none font-black tabular-nums">{s.value}</span>
                </span>
              ))}
            </div>
            {info.scoreNote && <p className="mt-1 text-[11px] text-white/50">{info.scoreNote}</p>}
            {info.next && (
              <div className="mt-4 rounded-2xl bg-white/[.06] px-3 py-2.5 ring-1 ring-white/10">
                <p className="text-[11px] font-bold tracking-wider text-signal uppercase">Next · {info.next.title}</p>
                {info.next.text && <p className="mt-0.5 text-[13px] text-white/80">{info.next.text}</p>}
              </div>
            )}
            <p className="mt-3 text-[10px] text-white/40">Tap to continue</p>
          </motion.div>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

/** How many of something this screen has already shown, remembered per game on this device. */
export function seenCount(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : Number(raw) || 0;
  } catch {
    return fallback;
  }
}
export function saveSeen(key, n) {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* private mode */
  }
}

import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Play, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { Poster } from "@/components/ui/Poster";
import { removeItem, useUserCollection } from "@/lib/userData";
import { formatTime } from "@/features/player/engine";

/** "Continue watching" row: movies you stopped part-way, synced across devices (users/{uid}/progress). */
export function ContinueWatching() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { items } = useUserCollection(user?.uid, "progress");
  const rows = items.filter((p) => p.duration > 0 && p.position > 30 && p.position < p.duration - 60).slice(0, 10);
  if (!rows.length) return null;

  return (
    <section className="mb-10 pt-6 lg:pt-10">
      <h2 className="mb-4 font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">Continue watching</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <AnimatePresence initial={false}>
          {rows.map((p) => {
            const pct = Math.min(100, (p.position / p.duration) * 100);
            return (
              <motion.div
                key={p.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative w-[min(70vw,300px)] shrink-0 snap-start"
              >
                <button
                  onClick={() => navigate(`/?u=${encodeURIComponent(p.pageUrl)}&play=1&t=${Math.floor(p.position)}`)}
                  className="relative block aspect-video w-full overflow-hidden rounded-2xl text-left ring-1 ring-white/10"
                  aria-label={`Resume ${p.title}`}
                >
                  <div className="absolute inset-0 scale-[1.6] blur-[1px]">
                    <Poster src={p.poster} title="" palette={p.palette ?? undefined} className="!aspect-auto size-full !rounded-none !ring-0" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <span className="absolute top-1/2 left-1/2 grid size-12 -translate-1/2 place-items-center rounded-full bg-signal text-ink-950 opacity-0 shadow-[0_0_40px_-8px_rgb(198_255_61/.8)] transition group-hover:opacity-100">
                    <Play className="ml-0.5 size-5" fill="currentColor" />
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="font-mono text-[11px] text-mist-300">
                      {formatTime(p.duration - p.position)} left
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/20">
                      <div className="h-full rounded-full bg-signal" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => removeItem(user.uid, "progress", p.id)}
                  aria-label="Remove from Continue watching"
                  className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-black/60 text-mist-100 opacity-100 backdrop-blur transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}

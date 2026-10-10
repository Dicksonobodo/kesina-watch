import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Download } from "lucide-react";
import { formatSpeed } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ACTIVE, useDownloads } from "./DownloadsProvider";
import { JobCard } from "./JobCard";

// Floating panel: bottom-right on desktop, above the tab bar on phones.
export function DownloadsTray() {
  const { jobs, activeCount, clearFinished } = useDownloads();
  const [open, setOpen] = useState(true);

  // Pop open whenever a new download starts.
  const newest = jobs[0]?.id;
  useEffect(() => {
    if (newest) setOpen(true);
  }, [newest]);

  if (!jobs.length) return null;

  const active = jobs.filter((j) => ACTIVE.has(j.status));
  const speed = active.reduce((sum, j) => sum + (j.speed || 0), 0);
  const overall = active.length ? active.reduce((sum, j) => sum + (j.progress || 0), 0) / active.length : 1;
  const hasFinished = jobs.length > active.length;

  return (
    <motion.aside
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-strong fixed inset-x-3 bottom-[calc(max(.75rem,env(safe-area-inset-bottom))+4.75rem)] z-40 overflow-hidden rounded-3xl shadow-2xl shadow-black/60 sm:inset-x-auto sm:right-6 sm:w-[400px] lg:bottom-6"
    >
      <button onClick={() => setOpen((o) => !o)} className="relative flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="relative grid size-9 place-items-center rounded-xl bg-signal/10 ring-1 ring-signal/25">
          <Download className="size-4 text-signal" />
          {activeCount > 0 && <span className="absolute -top-1 -right-1 size-2.5 animate-pulse rounded-full bg-signal" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {activeCount ? `Downloading ${activeCount} ${activeCount === 1 ? "movie" : "movies"}` : "Downloads"}
          </span>
          <span className="block font-mono text-[11px] text-mist-500">
            {activeCount ? `${Math.round(overall * 100)}% · ${formatSpeed(speed)}` : `${jobs.length} finished`}
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-mist-500 transition", !open && "rotate-180")} />
        {activeCount > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/[.04]">
            <motion.span className="block h-full bg-signal" animate={{ width: `${overall * 100}%` }} transition={{ duration: 0.4 }} />
          </span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="max-h-[50vh] space-y-2 overflow-y-auto px-3 pb-3">
              <AnimatePresence initial={false}>
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} place="tray" />
                ))}
              </AnimatePresence>
              {hasFinished && (
                <button onClick={clearFinished} className="w-full py-1.5 text-center text-xs font-medium text-mist-500 transition hover:text-mist-100">
                  Clear finished
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ShieldCheck } from "lucide-react";
import { hostnameOf } from "@/lib/format";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

const STEPS = [
  "Opening page with Shield on",
  "Blocking ads, pop-ups and redirects",
  "Finding the real video source",
  "Reading qualities and file size",
];

export function DetectionProgress({ url, demo }) {
  const [step, setStep] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [blocked, setBlocked] = useState(0);

  useEffect(() => {
    // Real detection takes 1–40s, so steps pace slower and the last one waits for the server.
    const stepTimer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), demo ? 1000 : 2200);
    const clock = setInterval(() => setSeconds((s) => s + 1), 1000);
    const blockTimer = demo ? setInterval(() => setBlocked((b) => b + 1 + Math.floor(Math.random() * 4)), 260) : null;
    return () => {
      clearInterval(stepTimer);
      clearInterval(clock);
      if (blockTimer) clearInterval(blockTimer);
    };
  }, [demo]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="glass grid gap-6 rounded-[28px] p-5 sm:grid-cols-[200px_1fr] sm:p-7"
    >
      {/* Scanning poster */}
      <div className="relative mx-auto aspect-[2/3] w-40 overflow-hidden rounded-2xl bg-ink-800 ring-1 ring-white/10 sm:w-full">
        <div className="skeleton absolute inset-0" />
        <div className="absolute inset-x-0 h-1/3 animate-scan bg-gradient-to-b from-transparent via-signal/25 to-transparent" />
        <div className="absolute inset-x-[12%] bottom-[10%] space-y-2">
          <div className="skeleton h-2 w-1/3 rounded-full" />
          <div className="skeleton h-3.5 w-4/5 rounded-full" />
        </div>
      </div>

      <div className="flex flex-col">
        <p className="truncate font-mono text-xs text-mist-500">{hostnameOf(url)}</p>
        <div className="mt-2 space-y-2">
          <div className="skeleton h-7 w-3/4 rounded-lg" />
          <div className="skeleton h-4 w-1/3 rounded-md" />
        </div>

        <ol className="mt-7 space-y-3.5">
          {STEPS.map((label, i) => {
            const state = i < step ? "done" : i === step ? "active" : "todo";
            return (
              <li key={label} className="flex items-center gap-3 text-[14px]">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full ring-1 transition",
                    state === "done" && "bg-signal text-ink-950 ring-signal",
                    state === "active" && "text-signal ring-signal/40",
                    state === "todo" && "text-mist-700 ring-white/10",
                  )}
                >
                  {state === "done" ? <Check className="size-3.5" strokeWidth={3} /> : state === "active" ? <Spinner className="size-3" /> : null}
                </span>
                <span className={cn("transition", state === "todo" ? "text-mist-700" : "text-mist-100")}>{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="mt-auto flex items-end justify-between gap-4 pt-7">
          {demo ? (
            <div>
              <p className="font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">Blocked so far</p>
              <p className="mt-1 font-display text-4xl font-bold text-signal text-glow">
                <AnimatedNumber value={blocked} />
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="relative grid size-11 place-items-center rounded-2xl bg-signal/10 ring-1 ring-signal/25">
                <span className="absolute inset-0 animate-ping rounded-2xl bg-signal/10" />
                <ShieldCheck className="relative size-5 text-signal" />
              </span>
              <div>
                <p className="font-mono text-[11px] tracking-[.18em] text-mist-500 uppercase">Shield working</p>
                <p className="font-mono text-2xl font-medium tabular-nums">{seconds}s</p>
              </div>
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.p
              key={seconds > 15 ? "slow" : "normal"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-[200px] text-right text-xs text-mist-700"
            >
              {seconds > 15
                ? "Heavy page. We're clicking past its traps so you don't have to. Up to a minute."
                : "Everything you would have clicked through. You never see it."}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}

import { AnimatePresence, motion } from "motion/react";
import { MousePointerClick, ScanSearch, ShieldCheck, Sparkles, Link2 } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { isDemoApi } from "@/lib/api";
import { greeting } from "@/lib/format";
import { cn } from "@/lib/cn";
import { DetectionProgress } from "./DetectionProgress";
import { DetectionResult } from "./DetectionResult";
import { LinkBar } from "./LinkBar";
import { useDetector } from "./useDetector";
import { ContinueWatching } from "./ContinueWatching";

export function HomePage() {
  const { user } = useAuth();
  const detector = useDetector();
  const { url, status, result, reset, autoplay } = detector;
  const firstName = (user?.displayName || "").split(" ")[0];
  const compact = status === "detecting" || status === "done";

  return (
    <div>
      {/* Hero */}
      <motion.section layout className={cn("transition-all", compact ? "pt-0" : "pt-4 lg:pt-12")}>
        <p className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">
          {greeting()}
          {firstName && `, ${firstName}`}
        </p>

        <AnimatePresence initial={false}>
          {!compact && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <h1 className="mt-4 font-display text-[clamp(38px,7.5vw,84px)] leading-[0.95] font-extrabold tracking-[-0.035em]">
                Paste a link.
                <br />
                Get the <Underlined>movie.</Underlined>
              </h1>
              <p className="mt-5 max-w-md text-[16px] leading-relaxed text-mist-500 sm:text-[17px]">
                No ads. No pop-ups. No fake buttons. We open the page for you, with every trap blocked, and hand you the real file.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <LinkBar
          detector={detector}
          className={compact ? "mt-4" : "mt-9"}
          placeholder="https://somemoviesite.com/watch/the-movie-2025"
          label="Movie page link"
          actionLabel="Detect"
          busyLabel="Detecting"
          actionIcon={ScanSearch}
        />

        {isDemoApi && !compact && (
          <p className="mt-4 flex items-center gap-2 pl-5 text-xs text-mist-700">
            <Sparkles className="size-3.5" />
            Demo mode: results are simulated until the detection server goes live.
          </p>
        )}
      </motion.section>

      {/* Stage. Each view animates itself in. No exit transitions: a cached result can
          arrive instantly, and "wait"-mode exits could leave the stage blank. */}
      <div className="mt-8">
        {status === "detecting" && <DetectionProgress url={url} demo={isDemoApi} />}
        {status === "done" && result && <DetectionResult key={result.url} result={result} onReset={reset} autoplay={autoplay} />}
        {(status === "idle" || status === "error") && (
          <>
            <ContinueWatching />
            <HowItWorks />
          </>
        )}
      </div>
    </div>
  );
}

function Underlined({ children }) {
  return (
    <span className="relative inline-block text-signal">
      {children}
      <svg viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-[0.08em] left-0 h-[0.18em] w-full" aria-hidden>
        <motion.path
          d="M3 14 C 60 4, 120 4, 180 10 S 270 16, 297 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.3, ease: [0.65, 0, 0.35, 1] }}
        />
      </svg>
    </span>
  );
}

const STEPS = [
  {
    icon: Link2,
    title: "Paste any movie page",
    body: "Copy the link from the site you'd normally fight your way through.",
  },
  {
    icon: ShieldCheck,
    title: "We take the hits",
    body: "Our Shield opens the page for you. Ads, pop-ups and redirect chains never reach your screen.",
  },
  {
    icon: MousePointerClick,
    title: "One real button",
    body: "Pick a quality and download, or watch right here in the clean player.",
  },
];

function HowItWorks() {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="grid gap-3 pt-6 sm:grid-cols-3 lg:pt-10"
    >
      {STEPS.map(({ icon: Icon, title, body }, i) => (
        <motion.div
          key={title}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="group relative overflow-hidden rounded-3xl bg-white/[.025] p-6 ring-1 ring-white/[.06] transition hover:bg-white/[.04]"
        >
          <span className="absolute top-5 right-6 font-display text-5xl font-extrabold text-white/[.04] transition group-hover:text-signal/10">
            0{i + 1}
          </span>
          <span className="grid size-11 place-items-center rounded-2xl bg-signal/10 ring-1 ring-signal/20">
            <Icon className="size-5 text-signal" />
          </span>
          <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-mist-500">{body}</p>
        </motion.div>
      ))}
    </motion.section>
  );
}

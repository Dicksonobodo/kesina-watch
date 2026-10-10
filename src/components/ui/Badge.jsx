import { cn } from "@/lib/cn";

const tones = {
  signal: "bg-signal/10 text-signal ring-signal/25",
  live: "bg-live/12 text-live ring-live/30",
  neutral: "bg-white/[.05] text-mist-300 ring-white/10",
};

export function Badge({ tone = "neutral", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-medium tracking-wide uppercase ring-1",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function LiveDot() {
  return (
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-live opacity-70" />
      <span className="relative inline-flex size-2 rounded-full bg-live" />
    </span>
  );
}

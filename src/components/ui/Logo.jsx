import { cn } from "@/lib/cn";

export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--color-signal)" />
      <path d="M12.5 9.5v13l10.5-6.5z" fill="var(--color-ink-950)" />
    </svg>
  );
}

export function Logo({ className }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="font-display text-[17px] font-bold tracking-tight">
        dixon<span className="text-signal">.</span>
        <span className="font-medium text-mist-300">watch</span>
      </span>
    </span>
  );
}

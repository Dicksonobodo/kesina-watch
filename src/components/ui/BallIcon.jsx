import { cn } from "@/lib/cn";

// A football that looks the same on every device (emoji balls render very differently per OS).
export function BallIcon({ className, muted = false }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("inline-block size-3.5 shrink-0", muted && "opacity-50", className)} aria-label="Goal" role="img">
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#111" strokeWidth="1.2" />
      <path d="M12 7.2l3.6 2.6-1.4 4.2H9.8L8.4 9.8z" fill="#111" />
      <path
        d="M12 7.2V3.2M15.6 9.8l3.9-1.3M14.2 14l2.4 3.4M9.8 14l-2.4 3.4M8.4 9.8L4.5 8.5"
        stroke="#111"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

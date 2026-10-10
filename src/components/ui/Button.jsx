import { cn } from "@/lib/cn";
import { Spinner } from "./Spinner";

const variants = {
  primary:
    "bg-signal text-ink-950 hover:bg-signal-dim shadow-[0_0_0_1px_rgb(198_255_61/.35),0_10px_34px_-10px_rgb(198_255_61/.7)] hover:shadow-[0_0_0_1px_rgb(198_255_61/.5),0_14px_44px_-10px_rgb(198_255_61/.9)]",
  light: "bg-mist-100 text-ink-950 hover:bg-white",
  ghost: "glass text-mist-100 hover:bg-white/[.08]",
  subtle: "text-mist-300 hover:bg-white/5 hover:text-mist-100",
  danger: "bg-live/10 text-live ring-1 ring-live/30 hover:bg-live/20",
};

const sizes = {
  sm: "h-9 gap-1.5 px-3.5 text-[13px]",
  md: "h-11 gap-2 px-5 text-sm",
  lg: "h-14 gap-2.5 px-7 text-[15px]",
  icon: "size-10",
};

export function Button({ variant = "primary", size = "md", loading = false, className, children, disabled, ...props }) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight whitespace-nowrap",
        "transition-all duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-45",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

import { cn } from "@/lib/cn";

export function Avatar({ user, className }) {
  const initials = (user?.displayName || user?.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  if (user?.photoURL) {
    return (
      <img
        src={user.photoURL}
        alt=""
        referrerPolicy="no-referrer"
        className={cn("size-9 rounded-full object-cover ring-1 ring-white/15", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-signal to-emerald-500 font-display text-xs font-bold text-ink-950",
        className,
      )}
    >
      {initials}
    </span>
  );
}

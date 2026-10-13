import { motion } from "motion/react";
import { Coins, Flame, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

/* Building blocks shared by every game. */

export const LETTERS = ["A", "B", "C", "D"];

export function OptionButton({ index, label, state, disabled, onClick }) {
  // state: idle | picked | correct | wrong | dim
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.985 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium ring-1 transition",
        state === "idle" && "bg-white/[.04] ring-white/[.08] hover:bg-white/[.07] hover:ring-white/20",
        state === "picked" && "bg-signal/10 ring-signal/60",
        state === "correct" && "bg-signal/15 text-signal ring-signal",
        state === "wrong" && "bg-live/10 text-live ring-live/60",
        state === "dim" && "bg-white/[.02] text-mist-500 ring-white/[.05]",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold",
          state === "correct" ? "bg-signal text-ink-950" : state === "wrong" ? "bg-live text-ink-950" : "bg-white/10 text-mist-300",
        )}
      >
        {LETTERS[index]}
      </span>
      <span className="min-w-0 flex-1 break-words">{label}</span>
    </motion.button>
  );
}

/** A thin bar that drains over `seconds`; calls onEnd once at zero. */
export function TimeBar({ seconds, startedAt, paused }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[.07]">
      <motion.div
        key={startedAt}
        className="h-full rounded-full bg-signal"
        initial={{ width: "100%" }}
        animate={{ width: paused ? undefined : "0%" }}
        transition={{ duration: seconds, ease: "linear" }}
        style={{ backgroundColor: undefined }}
      />
    </div>
  );
}

export function Card({ className, children, ...rest }) {
  return (
    <div className={cn("rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06] sm:p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }) {
  return <p className={cn("font-mono text-[11px] font-medium tracking-[.2em] text-mist-500 uppercase", className)}>{children}</p>;
}

/** What a finished game earned: XP, coins, streak, level, achievements. */
export function RewardCard({ reward }) {
  if (!reward) return null;
  return (
    <div className="rounded-3xl bg-gradient-to-br from-signal/[.12] to-transparent p-5 ring-1 ring-signal/20">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Stat icon={Sparkles} value={`+${reward.gainedXp}`} label="XP" />
        <Stat icon={Coins} value={`+${reward.gainedCoins}`} label="coins" />
        <Stat icon={Flame} value={reward.streak} label={reward.streak === 1 ? "day streak" : "day streak"} />
        <span className="ml-auto font-mono text-[11px] tracking-wider text-mist-500 uppercase">Level {reward.level}</span>
      </div>
      {reward.streakBonus > 0 && <p className="mt-3 text-xs text-mist-500">Includes a +{reward.streakBonus} XP daily-streak bonus.</p>}
      {reward.achievements?.length > 0 && (
        <ul className="mt-4 space-y-2">
          {reward.achievements.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl bg-white/[.05] px-3 py-2.5">
              <span className="text-xl">{a.icon}</span>
              <span className="flex-1 text-sm font-semibold">{a.name}</span>
              <span className="font-mono text-[11px] text-signal">
                +{a.xp} XP · +{a.coins} coins
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ icon: Icon, value, label }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="size-5 text-signal" />
      <span>
        <span className="block font-display text-2xl leading-none font-bold tabular-nums">{value}</span>
        <span className="block text-[11px] text-mist-500">{label}</span>
      </span>
    </span>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p className="rounded-2xl bg-live/[.08] px-4 py-3 text-sm text-live ring-1 ring-live/25">{children}</p>;
}

/** Avatar + name used in boards and rooms. */
export function PlayerChip({ avatar, name, level, className }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-white/[.07] text-lg ring-1 ring-white/10">{avatar ?? "⚽"}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{name}</span>
        {level != null && <span className="block font-mono text-[10px] tracking-wider text-mist-500 uppercase">Level {level}</span>}
      </span>
    </span>
  );
}

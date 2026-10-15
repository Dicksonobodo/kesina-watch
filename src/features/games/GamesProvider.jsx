import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Coins, Flame, Sparkles, Trophy } from "lucide-react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { gamesApi, THEME_COLORS } from "@/lib/games";
import { publishGameProfile } from "@/lib/gameIdentity";
import { ChatProvider } from "./chat/ChatProvider";
import { ChatLauncher, ChatPanel } from "./chat/ChatPanel";
import { GameHost } from "./chat/GameHost";

/*
 * The player's game profile (XP, level, coins, streak) for every games page, plus a small
 * toast that celebrates rewards and unlocked achievements.
 */

const GamesContext = createContext(null);

export function GamesLayout() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: "", profile: null, daily: null, store: "memory", kinds: {}, weekEndsInMs: 0 });
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const data = await gamesApi("profile.get");
      setState({ loading: false, error: "", profile: data.profile, daily: data.daily, store: data.store, kinds: data.kinds, weekEndsInMs: data.weekEndsInMs });
      publishGameProfile(data.profile);
      return data;
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
      return null;
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user?.uid, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const toast = useCallback((item) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, ...item }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  /** Shows what a finished game earned and refreshes the profile. */
  const rewarded = useCallback(
    (reward) => {
      if (reward) {
        if (reward.leveledUp) toast({ kind: "level", title: `Level ${reward.level}!`, body: "You levelled up." });
        for (const a of reward.achievements ?? []) toast({ kind: "achievement", title: a.name, body: `Achievement unlocked · +${a.xp} XP`, icon: a.icon });
      }
      refresh();
    },
    [toast, refresh],
  );

  const value = useMemo(() => ({ ...state, refresh, rewarded, toast, setProfile: (profile) => (publishGameProfile(profile), setState((s) => ({ ...s, profile }))) }), [state, refresh, rewarded, toast]);
  const accent = THEME_COLORS[state.profile?.theme] ?? THEME_COLORS.lime;

  return (
    <GamesContext.Provider value={value}>
      <div style={{ "--color-signal": accent }}>
        <ChatProvider>
          <Outlet />
          <ChatLauncher />
          <ChatPanel />
          <GameHost />
        </ChatProvider>
      </div>
      <Toasts items={toasts} />
    </GamesContext.Provider>
  );
}

export function useGames() {
  const ctx = useContext(GamesContext);
  if (!ctx) throw new Error("useGames must be used inside <GamesLayout>");
  return ctx;
}

function Toasts({ items }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[120] flex flex-col items-center gap-2 px-4 lg:bottom-8">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={t.onClick}
            className={`glass-strong pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl shadow-black/50 ${t.onClick ? "cursor-pointer" : ""}`}
          >
            <span className="grid size-10 place-items-center rounded-xl bg-signal/15 text-xl">{t.icon ?? (t.kind === "level" ? <Trophy className="size-5 text-signal" /> : <Sparkles className="size-5 text-signal" />)}</span>
            <span>
              <span className="block text-sm font-bold">{t.title}</span>
              <span className="line-clamp-2 block text-xs text-mist-500">{t.body}</span>
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------- small shared pieces ---------- */

export function XpBar({ profile, compact = false }) {
  if (!profile) return null;
  const span = Math.max(1, profile.levelCeil - profile.levelFloor);
  const pct = Math.min(100, Math.round(((profile.xp - profile.levelFloor) / span) * 100));
  return (
    <div className={compact ? "w-full" : "w-full"}>
      <div className="flex items-center justify-between text-[11px] text-mist-500">
        <span className="font-mono tracking-wider text-mist-300 uppercase">Level {profile.level}</span>
        <span className="font-mono">
          {profile.xp - profile.levelFloor} / {span} XP
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[.07]">
        <motion.div className="h-full rounded-full bg-signal" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

export function StatChip({ icon: Icon, value, label, tone }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.05] px-3 py-1.5 text-[13px] font-semibold ring-1 ring-white/10" title={label}>
      <Icon className={tone === "live" ? "size-4 text-live" : "size-4 text-signal"} />
      <span className="tabular-nums">{value}</span>
    </span>
  );
}

export const FlameIcon = Flame;
export const CoinIcon = Coins;

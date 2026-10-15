import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Check, Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";

/*
 * Pick your shooter and your keeper: famous players with their photos, and a search over hundreds
 * more. The last squad you used is remembered on this device.
 */

let cached = null;
let loading = null;

export function useShootoutPlayers() {
  const [data, setData] = useState(cached);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cached) return;
    loading ??= gamesApi("so.players").then((d) => (cached = d));
    loading.then(setData).catch((err) => {
      loading = null;
      setError(err.message);
    });
  }, []);
  return { players: data, error };
}

const KEY = "dw-so-squad";
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};

/** [squad, setSquad]: { shooter, keeper } (players), remembered on this device. Defaults to the first famous pair. */
export function useSavedSquad() {
  const { players } = useShootoutPlayers();
  const [squad, setSquadState] = useState(read);
  const set = (next) => {
    setSquadState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };
  const value = squad?.shooter && squad?.keeper ? squad : players ? { shooter: players.shooters[0], keeper: players.keepers[0] } : null;
  return [value, set];
}

/** What the server wants: the ids. */
export const squadPayload = (squad) => (squad ? { shooter: squad.shooter?.id, keeper: squad.keeper?.id } : null);

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/** A player's cut-out photo on a soft gradient, or their initials. */
export function PlayerPhoto({ player, className, ring }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-b from-white/20 to-white/[.04]", className)} style={ring ? { boxShadow: `inset 0 0 0 1.5px ${ring}` } : undefined}>
      {player?.photo && !failed ? (
        <img src={player.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-x-0 bottom-0 h-[112%] w-full object-cover object-top" />
      ) : (
        <span className="font-display text-[0.8em] font-extrabold text-white/85">{initials(player?.name)}</span>
      )}
    </span>
  );
}

function Slot({ label, player, onClick, tone }) {
  return (
    <button onClick={onClick} className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-white/[.04] p-2.5 text-left ring-1 ring-white/10 transition hover:bg-white/[.07] hover:ring-signal/40">
      <PlayerPhoto player={player} className="size-14 rounded-xl text-lg" ring={tone} />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] tracking-wider text-mist-500 uppercase">{label}</span>
        <span className="block truncate text-sm font-bold">{player?.name ?? "Pick one"}</span>
        <span className="block truncate text-[11px] text-mist-500">{player?.team || " "}</span>
      </span>
      <span className="shrink-0 rounded-full bg-white/[.06] px-2.5 py-1 text-[11px] font-semibold text-signal ring-1 ring-white/10">Change</span>
    </button>
  );
}

export function SquadPicker({ value, onChange, className }) {
  const [open, setOpen] = useState(null); // "shooter" | "keeper"
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row", className)}>
      <Slot label="Your shooter" player={value?.shooter} tone="var(--color-signal)" onClick={() => setOpen("shooter")} />
      <Slot label="Your keeper" player={value?.keeper} tone="#f59e0b" onClick={() => setOpen("keeper")} />
      <PlayerSheet
        role={open}
        current={open ? value?.[open] : null}
        onClose={() => setOpen(null)}
        onPick={(p) => {
          onChange({ ...value, [open]: p });
          setOpen(null);
        }}
      />
    </div>
  );
}

function PlayerSheet({ role, current, onClose, onPick }) {
  const { players, error } = useShootoutPlayers();
  const [q, setQ] = useState("");
  useEffect(() => setQ(""), [role]);
  const key = role === "keeper" ? "keepers" : "shooters";
  const words = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/).filter(Boolean);
  const match = (p) => words.every((w) => `${p.name} ${p.team}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(w));
  const famous = useMemo(() => (players ? players[key].filter(match) : []), [players, key, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = useMemo(() => (players && words.length && q.trim().length >= 2 ? players.more[key].filter(match).slice(0, 30) : []), [players, key, q]); // eslint-disable-line react-hooks/exhaustive-deps

  return createPortal(
    <AnimatePresence>
      {role && (
        <motion.div key="sheet" className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[min(86dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-ink-900 pb-[env(safe-area-inset-bottom)] ring-1 ring-white/10 sm:rounded-[28px]"
          >
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <h3 className="flex-1 font-display text-lg font-bold">{role === "keeper" ? "Pick your keeper" : "Pick your shooter"}</h3>
              <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/[.06] text-mist-300 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="mx-4 mb-3 flex h-11 items-center gap-2.5 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50">
              <Search className="size-4 shrink-0 text-mist-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={role === "keeper" ? "Search keepers" : "Search players"} aria-label="Search players" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {!players && !error && (
                <div className="grid place-items-center py-16">
                  <Spinner className="size-6 text-signal" />
                </div>
              )}
              {error && <p className="py-10 text-center text-sm text-live">{error}</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {famous.map((p) => (
                  <button key={p.id} onClick={() => onPick(p)} className={cn("relative flex flex-col items-center gap-1.5 rounded-2xl bg-white/[.03] p-2 pb-2.5 text-center ring-1 transition hover:bg-white/[.07]", current?.id === p.id ? "ring-2 ring-signal" : "ring-white/[.07]")}>
                    <PlayerPhoto player={p} className="aspect-square w-full rounded-xl text-xl" />
                    <span className="line-clamp-1 w-full text-[12px] leading-tight font-bold">{p.name}</span>
                    <span className="line-clamp-1 w-full text-[10px] leading-tight text-mist-500">{p.team}</span>
                    {current?.id === p.id && (
                      <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-signal text-ink-950">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {more.length > 0 && (
                <>
                  <p className="mt-5 mb-2 font-mono text-[10px] tracking-wider text-mist-500 uppercase">More players</p>
                  <div className="divide-y divide-white/[.05] overflow-hidden rounded-2xl bg-white/[.03] ring-1 ring-white/[.06]">
                    {more.map((p) => (
                      <button key={p.id} onClick={() => onPick(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[.05]">
                        <PlayerPhoto player={p} className="size-9 rounded-lg text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{p.name}</span>
                          <span className="block truncate text-[11px] text-mist-500">{p.team}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {players && famous.length === 0 && more.length === 0 && <p className="py-10 text-center text-sm text-mist-500">Nobody matches "{q}".</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

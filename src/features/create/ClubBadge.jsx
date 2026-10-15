import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Search, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";

/*
 * Team badges for the tournament creator. A team can wear a real club's badge (or a national
 * team's): the list of clubs and their badges is saved with the site (public/clubs.json, badges
 * from TheSportsDB), so picking one needs no server call. Teams without one get a shield with
 * their initials.
 */

let cached = null;
let loading = null;

export function useClubs() {
  const [clubs, setClubs] = useState(cached);
  const [error, setError] = useState("");
  useEffect(() => {
    if (cached) return;
    loading ??= fetch("/clubs.json").then((r) => {
      if (!r.ok) throw new Error("Couldn't load the club list.");
      return r.json();
    });
    loading
      .then((list) => setClubs((cached = list)))
      .catch((e) => {
        loading = null;
        setError(e.message);
      });
  }, []);
  return { clubs, error };
}

/** A smaller copy of the badge (the full one is large). */
const small = (src) => (src && src.includes("thesportsdb.com") ? `${src}/tiny` : src);

const initials = (name = "") =>
  name
    .replace(/\b(fc|cf|sc|afc|united|city|club)\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || name.slice(0, 2).toUpperCase();
const hue = (name = "") => [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** A team's badge: the real club's if they picked one, otherwise a shield with their initials. */
export function TeamBadge({ src, name, className }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img src={small(src)} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("size-5 shrink-0 object-contain", className)} />;
  const h = hue(name);
  return (
    <svg viewBox="0 0 24 28" className={cn("size-5 shrink-0", className)} aria-hidden>
      <path d="M12 1 22 4.5v8.2c0 6.6-4.3 11.2-10 14.3C6.3 23.9 2 19.3 2 12.7V4.5Z" fill={`hsl(${h} 55% 38%)`} stroke={`hsl(${h} 60% 62%)`} strokeWidth="1.4" />
      <text x="12" y="17.3" textAnchor="middle" fontSize="8.6" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
        {initials(name).slice(0, 2)}
      </text>
    </svg>
  );
}

/** Badge and name together. */
export function TeamLabel({ name, badge, className, badgeClass, reverse = false }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", reverse && "flex-row-reverse", className)}>
      <TeamBadge src={badge} name={name} className={badgeClass} />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

const plain = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Pick a real club's badge. `forTeam` is the team being dressed (null when adding a club as a new
 * team). onPick(club) with { name, badge }, or onPick(null) to take the badge off.
 */
export function ClubPicker({ open, forTeam, current, onPick, onClose }) {
  const { clubs, error } = useClubs();
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("All");
  const openedAt = useRef(0);
  useEffect(() => {
    if (open) {
      setQ("");
      openedAt.current = Date.now();
    }
  }, [open]);
  const groups = useMemo(() => ["All", ...new Set((clubs ?? []).map((c) => c.group))], [clubs]);
  const shown = useMemo(() => {
    const words = plain(q).split(/\s+/).filter(Boolean);
    return (clubs ?? []).filter((c) => (group === "All" || c.group === group) && words.every((w) => plain(`${c.name} ${c.country} ${c.group}`).includes(w)));
  }, [clubs, q, group]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="clubs" className="fixed inset-0 z-[150] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => Date.now() - openedAt.current > 400 && onClose()}>
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[min(88dvh,760px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-ink-900 pb-[env(safe-area-inset-bottom)] ring-1 ring-white/10 sm:rounded-[28px]"
          >
            <div className="flex items-start gap-3 px-4 pt-4 pb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-lg font-bold">{forTeam ? `Badge for ${forTeam}` : "Add a real club"}</h3>
                <p className="text-xs text-mist-500">{forTeam ? "Pick a club's badge to show next to the team's name." : "The club's name and badge are added as a new team."}</p>
              </div>
              <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[.06] text-mist-300 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <div className="mx-4 mb-2 flex h-11 items-center gap-2.5 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50">
              <Search className="size-4 shrink-0 text-mist-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clubs or countries" aria-label="Search clubs" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700" />
            </div>
            <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
              {groups.map((g) => (
                <button key={g} onClick={() => setGroup(g)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ring-1 transition", group === g ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.04] text-mist-300 ring-white/10")}>
                  {g}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
              {!clubs && !error && (
                <div className="grid place-items-center py-16">
                  <Spinner className="size-6 text-signal" />
                </div>
              )}
              {error && <p className="py-10 text-center text-sm text-live">{error}</p>}
              {forTeam && current && (
                <button onClick={() => onPick(null)} className="mb-2 w-full rounded-2xl bg-white/[.04] py-2.5 text-sm font-semibold text-mist-300 ring-1 ring-white/10 hover:text-white">
                  Remove the badge
                </button>
              )}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {shown.map((c) => (
                  <button key={c.id} onClick={() => onPick({ name: c.name, badge: c.badge })} className={cn("flex flex-col items-center gap-1.5 rounded-2xl bg-white/[.03] p-2.5 text-center ring-1 transition hover:bg-white/[.07]", current === c.badge ? "ring-2 ring-signal" : "ring-white/[.07]")}>
                    <img src={small(c.badge)} alt="" loading="lazy" className="size-12 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,.4)]" />
                    <span className="line-clamp-2 w-full text-[11px] leading-tight font-semibold">{c.name}</span>
                  </button>
                ))}
              </div>
              {clubs && shown.length === 0 && <p className="py-10 text-center text-sm text-mist-500">No club matches "{q}".</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

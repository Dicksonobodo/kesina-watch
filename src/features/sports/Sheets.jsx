import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { paletteFor } from "@/lib/palette";
import { cn } from "@/lib/cn";
import { usePlayerPhoto } from "./photos";
import { CompareSheet, ComparePicker, DetailedStats } from "./PlayerStats";

/*
 * Panels that open on top of Sports / the match centre: player profile, team page and the
 * highlights video. Bottom sheet on phones, centred card on larger screens.
 */

export function Sheet({ onClose, label, children, z = "z-[98]", wide = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <motion.div className={cn("fixed inset-0 flex justify-center sm:items-center sm:p-6", z)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={label}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        className={cn("relative mt-auto max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] w-full overflow-y-auto rounded-t-[28px] bg-ink-900 pb-[env(safe-area-inset-bottom)] ring-1 ring-white/10 sm:mt-0 sm:max-h-[90dvh] sm:rounded-[28px] sm:pb-0", wide ? "max-w-3xl" : "max-w-lg")}
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 z-10 grid size-9 place-items-center rounded-full bg-white/[.08] transition hover:bg-white/[.14]">
          <X className="size-4" />
        </button>
        {children}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function useApi(path) {
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    fetch(path, { signal: AbortSignal.timeout(15_000) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Unavailable right now.");
        if (!cancelled) setState({ data: body, error: "" });
      })
      .catch((err) => !cancelled && setState({ data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return state;
}

export function Crest({ src, name = "", className }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={cn("grid shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[10px] font-bold", className)}>{name.slice(0, 3).toUpperCase()}</span>;
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("shrink-0 object-contain", className)} />;
}

// A portrait when we can find one (see photos.js); otherwise a designed badge with initials
// and shirt number. `photo` is used as-is when the feed already supplied one.
export function PlayerBadge({ name = "", team = "", jersey, photo, className }) {
  const found = usePlayerPhoto(photo ? "" : name, team);
  const [broken, setBroken] = useState(false);
  const src = !broken ? photo || found : null;
  const [a, b] = paletteFor(name);
  const initials = name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={cn("relative grid shrink-0 place-items-center rounded-2xl font-display font-bold text-white", className)} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {src ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full rounded-[inherit] object-cover object-top" />
      ) : (
        initials
      )}
      {jersey && <span className="absolute -right-1.5 -bottom-1.5 grid min-w-6 place-items-center rounded-full bg-ink-950 px-1 font-mono text-[10px] text-mist-100 ring-2 ring-ink-900">{jersey}</span>}
    </span>
  );
}

const Loading = () => (
  <div className="grid place-items-center py-20">
    <Spinner className="size-6 text-signal" />
  </div>
);

/* ---------- player ---------- */

/** matchStats: [{label, value}] when opened from a match's line-ups. */
export function PlayerSheet({ league, id, name, jersey, matchStats, onClose, onOpenTeam }) {
  const { data, error } = useApi(`/api/sports/player?league=${encodeURIComponent(league)}&id=${encodeURIComponent(id)}`);
  const [picking, setPicking] = useState(false);
  const [versus, setVersus] = useState(null); // the player chosen to compare with
  const p = data ?? { name, jersey };
  const facts = data
    ? [
        ["Position", p.position],
        ["Age", p.age],
        ["Born", p.born],
        ["Nationality", p.nationality],
        ["Height", p.height],
        ["Weight", p.weight],
      ].filter(([, v]) => v)
    : [];
  const shownMatch = (matchStats ?? []).filter((s) => s.value !== "0" || ["Goals", "Assists", "Shots"].includes(s.label));

  return (
    <Sheet onClose={onClose} label={p.name || "Player"}>
      <div className="p-6">
        <div className="flex items-center gap-4">
          <PlayerBadge name={p.name} team={data?.team ?? ""} jersey={p.jersey} photo={p.photo} className="size-16 text-xl" />
          <div className="min-w-0">
            <p className="truncate font-display text-2xl font-bold tracking-tight">{p.name}</p>
            {data?.team && (
              <button
                onClick={() => data.teamId && onOpenTeam?.(data.teamId)}
                className="mt-1 flex items-center gap-2 text-sm text-mist-300 transition hover:text-signal disabled:hover:text-mist-300"
                disabled={!onOpenTeam || !data.teamId}
              >
                <Crest src={data.teamLogo} name={data.team} className="size-5" /> {data.team}
              </button>
            )}
          </div>
          {data?.flag && <img src={data.flag} alt={data.nationality ?? ""} title={data.nationality ?? ""} className="ml-auto h-6 w-9 rounded object-cover" />}
        </div>

        {shownMatch.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">This match</h3>
            <div className="grid grid-cols-3 gap-2">
              {shownMatch.map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/[.04] p-3 text-center ring-1 ring-white/[.06]">
                  <p className="font-display text-xl font-bold">{s.value}</p>
                  <p className="text-[11px] text-mist-500">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {!data && !error && <Loading />}
        {error && <p className="mt-6 text-sm text-mist-500">{error}</p>}

        {data?.season?.length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">This season</h3>
            <div className="grid grid-cols-2 gap-2">
              {data.season.map((s) => (
                <div key={s.label} className="rounded-2xl bg-white/[.04] p-3 ring-1 ring-white/[.06]">
                  <p className="font-display text-xl font-bold">{s.value}</p>
                  <p className="text-[11px] text-mist-500">{s.label.replace("Starts-Substitute Appearances", "Starts (sub apps)")}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {data && <DetailedStats key={id} league={league} id={id} name={p.name || name} team={data.team} onCompare={() => setPicking(true)} />}

        {facts.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-mist-500">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {picking && <ComparePicker league={league} exclude={id} onClose={() => setPicking(false)} onPick={(p) => (setPicking(false), setVersus(p))} />}
      {versus && <CompareSheet a={{ league, id, name: p.name || name }} b={{ league: versus.league, id: versus.id, name: versus.name }} onClose={() => setVersus(null)} />}
    </Sheet>
  );
}

/* ---------- team ---------- */

const RESULT_TONE = { W: "bg-signal/15 text-signal", D: "bg-white/10 text-mist-300", L: "bg-live/15 text-live" };

export function TeamSheet({ league, id, onClose, onOpenPlayer }) {
  const { data, error } = useApi(`/api/sports/team?league=${encodeURIComponent(league)}&id=${encodeURIComponent(id)}`);
  const [tab, setTab] = useState("fixtures");

  return (
    <Sheet onClose={onClose} label={data?.name || "Team"} z="z-[97]" wide>
      {!data && !error && <Loading />}
      {error && <p className="p-8 text-sm text-mist-500">{error}</p>}
      {data && (
        <div className="p-6">
          <div className="flex items-center gap-4">
            <Crest src={data.logo} name={data.name} className="size-16" />
            <div>
              <p className="font-display text-2xl font-bold tracking-tight">{data.name}</p>
              <p className="text-sm text-mist-500">{[data.standing, data.record && `Record ${data.record}`].filter(Boolean).join(" · ")}</p>
            </div>
          </div>

          <div className="mt-5 flex gap-1 border-b border-white/[.06]">
            {[
              ["fixtures", "Fixtures"],
              ["results", "Results"],
              ["squad", "Squad"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={cn("relative px-3.5 py-2.5 text-[13px] font-semibold transition", tab === key ? "text-mist-100" : "text-mist-500 hover:text-mist-100")}>
                {label}
                {tab === key && <motion.span layoutId="team-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
              </button>
            ))}
          </div>

          {tab !== "squad" ? (
            <ul className="mt-3 divide-y divide-white/[.05]">
              {(tab === "fixtures" ? data.fixtures : data.results).map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-16 shrink-0 font-mono text-[11px] text-mist-500">
                    {new Date(g.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </span>
                  <span className="w-5 shrink-0 text-center font-mono text-[11px] text-mist-500">{g.venue === "home" ? "H" : "A"}</span>
                  <Crest src={g.opponentLogo} name={g.opponent} className="size-6" />
                  <span className="min-w-0 flex-1 truncate">{g.opponent}</span>
                  <span className="hidden text-[11px] text-mist-700 sm:inline">{g.competition}</span>
                  {g.result ? (
                    <span className={cn("rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold", RESULT_TONE[g.result])}>
                      {g.result} {g.score}
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-mist-300">{new Date(g.date).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </li>
              ))}
              {!(tab === "fixtures" ? data.fixtures : data.results).length && <li className="py-8 text-center text-sm text-mist-500">Nothing to show yet.</li>}
            </ul>
          ) : (
            <div className="mt-4 space-y-5">
              {data.squad.map((g) => (
                <div key={g.label}>
                  <p className="mb-2 font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">{g.label}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {g.players.map((p) => (
                      <button key={p.id} onClick={() => onOpenPlayer?.(p)} className="flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[.04]">
                        <PlayerBadge name={p.name} team={data.name} jersey={p.jersey} photo={p.photo} className="size-9 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-[11px] text-mist-500">{[p.nationality, p.age && `${p.age} yrs`].filter(Boolean).join(" · ")}</span>
                        </span>
                        {(p.goals > 0 || p.assists > 0) && (
                          <span className="shrink-0 font-mono text-[11px] text-mist-300">
                            {p.goals > 0 && `${p.goals}G`} {p.assists > 0 && `${p.assists}A`}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ---------- highlights ---------- */

/** A highlight clip. For goal clips, the next goal plays when this one ends (or with "Next goal"). */
export function HighlightPlayer({ clip, next = null, onNext, onClose }) {
  const [failed, setFailed] = useState(false);
  return (
    <Sheet onClose={onClose} label={clip.title} z="z-[99]" wide>
      <div className="p-3 sm:p-4">
        {failed ? (
          <div className="grid aspect-video w-full place-items-center rounded-2xl bg-black px-6 text-center text-sm text-mist-300">This clip can't be played right now.</div>
        ) : (
          <video src={clip.mp4} poster={clip.thumbnail ?? undefined} controls autoPlay playsInline onError={() => setFailed(true)} onEnded={() => next && onNext?.(next)} className="aspect-video w-full rounded-2xl bg-black" />
        )}
        <div className="flex items-start gap-3 px-2 pt-3 pb-2">
          <p className="min-w-0 flex-1 font-semibold">{clip.title}</p>
          {next && (
            <button onClick={() => onNext?.(next)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/[.08] px-3 py-1.5 text-xs font-semibold text-signal ring-1 ring-white/10 transition hover:bg-white/[.12]">
              Next goal{next.clock ? ` · ${next.clock}` : ""} ›
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

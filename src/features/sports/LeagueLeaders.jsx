import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Crest, PlayerBadge, PlayerSheet, TeamSheet } from "./Sheets";

// The leagues ESPN publishes scorer tables for (cups and the World Cup are left out).
const LEADER_LEAGUES = [
  { id: "eng.1", short: "EPL" },
  { id: "esp.1", short: "LaLiga" },
  { id: "ita.1", short: "Serie A" },
  { id: "ger.1", short: "Bundesliga" },
  { id: "fra.1", short: "Ligue 1" },
  { id: "uefa.champions", short: "UCL" },
];

/** Top scorers and top assists per league; tap a player for their profile, a crest for the team. */
export function LeagueLeaders({ preferred }) {
  const [league, setLeague] = useState(LEADER_LEAGUES.some((l) => l.id === preferred) ? preferred : "eng.1");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("scorers");
  const [player, setPlayer] = useState(null);
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    if (LEADER_LEAGUES.some((l) => l.id === preferred)) setLeague(preferred);
  }, [preferred]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    fetch(`/api/sports/leaders?league=${league}`, { signal: AbortSignal.timeout(15_000) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Unavailable right now.");
        if (!cancelled) setData(body);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [league]);

  const rows = data?.[kind] ?? [];
  const top = rows[0];

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <Crown className="size-5 text-signal" /> League leaders
        </h2>
        <div className="inline-flex rounded-full bg-white/[.03] p-1 ring-1 ring-white/[.06]">
          {[
            ["scorers", "Top scorers"],
            ["assists", "Assists"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setKind(key)} className={cn("relative h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition", kind === key ? "text-ink-950" : "text-mist-500 hover:text-mist-100")}>
              {kind === key && <motion.span layoutId="leaders-kind" className="absolute inset-0 rounded-full bg-mist-100" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {LEADER_LEAGUES.map((l) => (
          <button
            key={l.id}
            onClick={() => setLeague(l.id)}
            className={cn("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition", league === l.id ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-500 ring-white/10 hover:text-mist-100")}
          >
            {l.short}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-mist-500">{error}</p>}
      {!data && !error && <div className="skeleton h-72 rounded-3xl" />}

      {data && rows.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          {/* #1 spotlight */}
          <button
            onClick={() => setPlayer(top)}
            className="relative flex flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-signal/[.14] via-white/[.02] to-transparent p-6 text-left ring-1 ring-signal/20 transition hover:ring-signal/40"
          >
            <span className="font-mono text-[10.5px] tracking-[.18em] text-signal uppercase">#1 · {data.leagueName}</span>
            <div className="mt-4 flex items-center gap-4">
              <PlayerBadge name={top.name} className="size-16 text-xl" />
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-bold tracking-tight">{top.name}</p>
                <p className="flex items-center gap-1.5 text-sm text-mist-300">
                  <Crest src={top.teamLogo} name={top.team} className="size-4" /> {top.team}
                </p>
              </div>
            </div>
            <p className="mt-6 font-display text-6xl font-extrabold tracking-tight">
              {top.value}
              <span className="ml-2 text-base font-medium text-mist-500">
                {kind === "scorers" ? "goals" : "assists"}
                {top.matches ? ` in ${top.matches} games` : ""}
              </span>
            </p>
          </button>

          {/* The rest */}
          <ol className="divide-y divide-white/[.04] overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
            {rows.slice(1, 10).map((r) => (
              <li key={`${r.id}-${r.rank}`} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 text-right font-mono text-[12px] text-mist-500">{r.rank}</span>
                <button onClick={() => setPlayer(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <PlayerBadge name={r.name} className="size-8 rounded-xl text-[11px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium hover:underline">{r.name}</span>
                    <span className="block truncate text-[11px] text-mist-500">{r.team}</span>
                  </span>
                </button>
                <button onClick={() => r.teamId && setTeamId(r.teamId)} aria-label={`${r.team} team page`} className="shrink-0 rounded-full p-1 transition hover:bg-white/[.06]">
                  <Crest src={r.teamLogo} name={r.team} className="size-6" />
                </button>
                <span className="w-8 text-right font-display text-lg font-bold tabular-nums">{r.value}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {data && !rows.length && <p className="text-sm text-mist-500">No numbers yet for this league.</p>}

      <AnimatePresence>
        {teamId && <TeamSheet key={teamId} league={league} id={teamId} onClose={() => setTeamId(null)} onOpenPlayer={(p) => setPlayer({ id: p.id, name: p.name, jersey: p.jersey })} />}
        {player && (
          <PlayerSheet
            key={player.id}
            league={league}
            id={player.id}
            name={player.name}
            jersey={player.jersey}
            onClose={() => setPlayer(null)}
            onOpenTeam={(id) => {
              setPlayer(null);
              setTeamId(id);
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import { Crest, PlayerBadge, PlayerSheet, TeamSheet } from "./Sheets";

const KINDS = [
  { key: "scorers", label: "Top scorers", unit: "goals", player: true },
  { key: "assists", label: "Assists", unit: "assists", player: true },
  { key: "contributions", label: "Goals + assists", unit: "contributions", player: true },
  { key: "attack", label: "Best attack", unit: "goals scored", player: false },
  { key: "defence", label: "Best defence", unit: "goals conceded", player: false },
];

const PREVIEW = 10;

/** Leaders for a football league: players (goals, assists, both) and teams (attack, defence). */
export function LeagueLeaders({ league, leagueName }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("scorers");
  const [all, setAll] = useState(false);
  const [player, setPlayer] = useState(null);
  const [teamId, setTeamId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    setAll(false);
    fetch(`/api/sports/leaders?league=${encodeURIComponent(league)}`, { signal: AbortSignal.timeout(15_000) })
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

  const spec = KINDS.find((k) => k.key === kind);
  const rows = data?.[kind] ?? [];
  const top = rows[0];
  const shown = rows.slice(1, all ? 50 : PREVIEW);

  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <Crown className="size-5 text-signal" /> {leagueName} leaders
        </h2>
      </div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => {
              setKind(k.key);
              setAll(false);
            }}
            className={cn("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition", kind === k.key ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-500 ring-white/10 hover:text-mist-100")}
          >
            {k.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-mist-500">{error}</p>}
      {!data && !error && <div className="skeleton h-72 rounded-3xl" />}

      {data && top && (
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          {/* #1 spotlight */}
          <button
            onClick={() => (spec.player ? setPlayer(top) : setTeamId(top.id))}
            className="relative flex flex-col justify-end overflow-hidden rounded-3xl bg-gradient-to-br from-signal/[.14] via-white/[.02] to-transparent p-6 text-left ring-1 ring-signal/20 transition hover:ring-signal/40"
          >
            <span className="font-mono text-[10.5px] tracking-[.18em] text-signal uppercase">#1 · {spec.label}</span>
            <div className="mt-4 flex items-center gap-4">
              {spec.player ? <PlayerBadge name={top.name} team={top.team} className="size-28 rounded-3xl text-3xl" /> : <Crest src={top.logo} name={top.name} className="size-20" />}
              <div className="min-w-0">
                <p className="truncate font-display text-2xl font-bold tracking-tight">{top.name}</p>
                {spec.player && (
                  <p className="flex items-center gap-1.5 text-sm text-mist-300">
                    <Crest src={top.teamLogo} name={top.team} className="size-4" /> {top.team}
                  </p>
                )}
              </div>
            </div>
            <p className="mt-6 font-display text-6xl font-extrabold tracking-tight">
              {top.value}
              <span className="ml-2 text-base font-medium text-mist-500">
                {spec.unit}
                {(top.matches || top.played) && ` in ${top.matches || top.played} games`}
              </span>
            </p>
            {kind === "contributions" && <p className="mt-2 text-sm text-mist-300">{top.goals} goals · {top.assists} assists</p>}
          </button>

          {/* The rest */}
          <div>
            <ol className="divide-y divide-white/[.04] overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
              {shown.map((r, i) => (
                <li key={`${r.id}-${r.rank ?? i}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-5 text-right font-mono text-[12px] text-mist-500">{r.rank ?? i + 2}</span>
                  {spec.player ? (
                    <>
                      <button onClick={() => setPlayer(r)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <PlayerBadge name={r.name} team={r.team} className="size-9 rounded-xl text-[11px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium hover:underline">{r.name}</span>
                          <span className="block truncate text-[11px] text-mist-500">{kind === "contributions" ? `${r.team} · ${r.goals}G ${r.assists}A` : r.team}</span>
                        </span>
                      </button>
                      <button onClick={() => r.teamId && setTeamId(r.teamId)} aria-label={`${r.team} team page`} className="shrink-0 rounded-full p-1 transition hover:bg-white/[.06]">
                        <Crest src={r.teamLogo} name={r.team} className="size-6" />
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setTeamId(r.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <Crest src={r.logo} name={r.name} className="size-7" />
                      <span className="min-w-0 truncate text-sm font-medium hover:underline">{r.name}</span>
                    </button>
                  )}
                  <span className="w-8 text-right font-display text-lg font-bold tabular-nums">{r.value}</span>
                </li>
              ))}
            </ol>
            {rows.length > PREVIEW && (
              <button onClick={() => setAll((v) => !v)} className="mt-2 w-full rounded-2xl py-2.5 text-[13px] font-semibold text-mist-500 transition hover:bg-white/[.04] hover:text-mist-100">
                {all ? "Show less" : `Show top ${Math.min(rows.length, 50)}`}
              </button>
            )}
          </div>
        </div>
      )}
      {data && !top && <p className="text-sm text-mist-500">No numbers yet for this league.</p>}

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

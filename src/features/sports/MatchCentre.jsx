import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, MapPin, RefreshCw, Tv, Users, X } from "lucide-react";
import { LiveDot } from "@/components/ui/Badge";
import { BallIcon } from "@/components/ui/BallIcon";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { HighlightPlayer, PlayerSheet, TeamSheet } from "./Sheets";
import { Commentary, HeadToHead, Highlights, MatchNews, Performers } from "./MatchExtras";

// Team colours for comparisons (validated for contrast and colour-blind separation on the dark surface).
const HOME = "#6a9e0e";
const AWAY = "#8b6fe0";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "commentary", label: "Commentary" },
  { id: "lineups", label: "Line-ups" },
  { id: "stats", label: "Stats" },
  { id: "h2h", label: "Head-to-head" },
  { id: "table", label: "Table" },
  { id: "news", label: "News" },
];

// Which tabs have something to show for this match.
const HAS = {
  commentary: (m) => m.commentary?.length,
  lineups: (m) => m.lineups,
  stats: (m) => m.stats?.length,
  h2h: (m) => m.headToHead?.games?.length || m.form?.length,
  table: (m) => m.table,
  news: (m) => m.news?.length,
};

/** Full-screen match centre: score, timeline, formations on a pitch, stats and the league table. */
export function MatchCentre({ match: base, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("summary");
  const [player, setPlayer] = useState(null); // { id, name, jersey, matchStats }
  const [teamId, setTeamId] = useState(null);
  const [clip, setClip] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      try {
        const res = await fetch(`/api/sports/match?league=${encodeURIComponent(base.league)}&id=${encodeURIComponent(base.id)}`, {
          signal: AbortSignal.timeout(15_000),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Match details are unavailable.");
        if (cancelled) return;
        setData(body);
        setError("");
        if (body.state === "in") timer = setTimeout(load, 20_000); // live: keep it fresh
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [base.league, base.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const m = data ?? { ...base, events: [], stats: [], lineups: null, table: null };
  const live = m.state === "in";
  const tabs = TABS.filter((t) => !HAS[t.id] || HAS[t.id](m));
  const openPlayer = (p) => p?.id && setPlayer({ id: p.id, name: p.name, jersey: p.number ?? p.jersey, matchStats: p.stats });

  return createPortal(
    <motion.div className="fixed inset-0 z-[96] flex justify-center sm:items-center sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        role="dialog"
        aria-label={`${m.home.name} vs ${m.away.name}`}
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 34 }}
        className="relative mt-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-ink-900 pb-[env(safe-area-inset-bottom)] ring-1 ring-white/10 sm:mt-0 sm:max-h-[94dvh] sm:rounded-[28px] sm:pb-0"
      >
        {/* Scoreboard header */}
        <div className="relative shrink-0 overflow-hidden px-5 pt-5 pb-4 sm:px-7">
          <div
            aria-hidden
            className="absolute inset-0 opacity-70"
            style={{ background: `radial-gradient(60% 120% at 0% 0%, ${HOME}2e, transparent 70%), radial-gradient(60% 120% at 100% 0%, ${AWAY}2e, transparent 70%)` }}
          />
          <div className="relative flex items-center justify-between text-[12px] text-mist-300">
            <span>{m.leagueName ?? ""}</span>
            <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-white/[.06] transition hover:bg-white/[.12]">
              <X className="size-4" />
            </button>
          </div>
          <div className="relative mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamHead team={m.home} onOpen={() => m.home.id && setTeamId(m.home.id)} />
            <div className="text-center">
              {m.state === "pre" ? (
                <p className="font-display text-2xl font-bold">
                  {new Date(m.kickoff).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              ) : (
                <p className="font-display text-4xl font-bold tabular-nums sm:text-5xl">
                  {m.home.score ?? 0}
                  <span className="mx-2 text-mist-500">–</span>
                  {m.away.score ?? 0}
                </p>
              )}
              <p className={cn("mt-1 inline-flex items-center gap-1.5 font-mono text-[12px]", live ? "text-live" : "text-mist-500")}>
                {live && <LiveDot />}
                {live ? m.clock || m.detail : m.state === "post" ? "Full time" : new Date(m.kickoff).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
              </p>
            </div>
            <TeamHead team={m.away} onOpen={() => m.away.id && setTeamId(m.away.id)} />
          </div>
          <Scorers events={m.events} />
          <div className="relative mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] text-mist-500">
            {m.venue && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3" /> {m.venue}
                {m.city ? `, ${m.city}` : ""}
              </span>
            )}
            {m.attendance > 0 && (
              <span className="flex items-center gap-1">
                <Users className="size-3" /> {Number(m.attendance).toLocaleString()}
              </span>
            )}
            {m.broadcasters?.length > 0 && (
              <span className="flex items-center gap-1">
                <Tv className="size-3" /> {m.broadcasters.join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 border-y border-white/[.06] px-3 sm:px-5">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn("relative px-3.5 py-3 text-[13px] font-semibold whitespace-nowrap transition", tab === t.id ? "text-mist-100" : "text-mist-500 hover:text-mist-100")}
              >
                {t.label}
                {tab === t.id && <motion.span layoutId="match-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-signal" />}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {!data && !error && (
            <div className="grid place-items-center py-16">
              <Spinner className="size-6 text-signal" />
            </div>
          )}
          {error && !data && <p className="py-10 text-center text-sm text-mist-500">{error}</p>}
          {data && (
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                {tab === "summary" && (
                  <div className="space-y-8">
                    <Highlights clips={m.highlights} onPlay={setClip} />
                    <Performers match={m} onOpenPlayer={openPlayer} />
                    <Timeline match={m} />
                  </div>
                )}
                {tab === "commentary" && <Commentary lines={m.commentary} />}
                {tab === "lineups" && m.lineups && <Lineups match={m} onOpenPlayer={openPlayer} />}
                {tab === "stats" && <Stats match={m} />}
                {tab === "h2h" && <HeadToHead match={m} />}
                {tab === "table" && m.table && <Table rows={m.table} />}
                {tab === "news" && <MatchNews items={m.news} />}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {live && (
          <p className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/[.06] py-2 text-[11px] text-mist-700">
            <RefreshCw className="size-3" /> Updates automatically every 20 seconds
          </p>
        )}
      </motion.div>

      <AnimatePresence>
        {teamId && (
          <TeamSheet
            key={teamId}
            league={m.league}
            id={teamId}
            onClose={() => setTeamId(null)}
            onOpenPlayer={(p) => setPlayer({ id: p.id, name: p.name, jersey: p.jersey })}
          />
        )}
        {player && (
          <PlayerSheet
            key={player.id}
            league={m.league}
            {...player}
            onClose={() => setPlayer(null)}
            onOpenTeam={(id) => {
              setPlayer(null);
              setTeamId(id);
            }}
          />
        )}
        {clip && <HighlightPlayer key={clip.id} clip={clip} onClose={() => setClip(null)} />}
      </AnimatePresence>
    </motion.div>,
    document.body,
  );
}

/* ---------- header ---------- */

function Logo({ team, className }) {
  const [failed, setFailed] = useState(false);
  if (!team.logo || failed) {
    return <span className={cn("grid place-items-center rounded-full bg-white/10 font-mono text-[10px] font-bold", className)}>{team.abbr?.slice(0, 3)}</span>;
  }
  return <img src={team.logo} alt="" onError={() => setFailed(true)} className={cn("object-contain", className)} />;
}

function TeamHead({ team, onOpen }) {
  return (
    <button onClick={onOpen} className="group flex min-w-0 flex-col items-center gap-2 text-center" title={`${team.name}: fixtures, results, squad`}>
      <Logo team={team} className="size-14 transition group-hover:scale-105 sm:size-16" />
      <p className="w-full truncate text-sm font-semibold underline-offset-4 group-hover:underline sm:text-base">{team.short || team.name}</p>
    </button>
  );
}

function Scorers({ events }) {
  const goals = (events ?? []).filter((e) => e.kind === "goal" || e.kind === "own-goal");
  if (!goals.length) return null;
  const line = (side) =>
    goals
      .filter((g) => g.side === side)
      .map((g) => `${lastName(g.players[0])} ${g.clock}${g.kind === "own-goal" ? " (og)" : /penalty/i.test(g.label) ? " (pen)" : ""}`);
  return (
    <div className="relative mt-3 grid grid-cols-[1fr_auto_1fr] gap-3 text-[11.5px] text-mist-300">
      <p className="text-right leading-relaxed">{line("home").join(", ")}</p>
      <BallIcon className="mt-0.5 size-3" />
      <p className="leading-relaxed">{line("away").join(", ")}</p>
    </div>
  );
}

const lastName = (name = "") => name.split(" ").slice(-1)[0];

/* ---------- summary: timeline ---------- */

function EventIcon({ kind }) {
  if (kind === "goal" || kind === "own-goal") return <BallIcon className="size-4" muted={kind === "own-goal"} />;
  if (kind === "pen-miss") return <BallIcon className="size-4" muted />;
  if (kind === "yellow") return <span className="inline-block h-4 w-3 rounded-[2px] bg-yellow-400" aria-label="Yellow card" />;
  if (kind === "red") return <span className="inline-block h-4 w-3 rounded-[2px] bg-live" aria-label="Red card" />;
  if (kind === "sub")
    return (
      <span className="flex flex-col leading-none">
        <ArrowUp className="size-3 text-signal" />
        <ArrowDown className="-mt-0.5 size-3 text-live" />
      </span>
    );
  return null;
}

function eventText(e) {
  const [a, b] = e.players;
  if (e.kind === "sub") return { main: a ?? "Substitution", sub: b ? `off: ${b}` : "" };
  if (e.kind === "goal") return { main: a ?? "Goal", sub: b ? `assist: ${b}` : /penalty/i.test(e.label) ? "penalty" : "" };
  if (e.kind === "own-goal") return { main: a ?? "Own goal", sub: "own goal" };
  if (e.kind === "pen-miss") return { main: a ?? "Penalty", sub: "penalty missed" };
  return { main: a ?? e.label, sub: "" };
}

function Timeline({ match }) {
  const events = match.events;
  if (!events.length) {
    return <p className="py-10 text-center text-sm text-mist-500">{match.state === "pre" ? "The timeline starts at kick-off." : "No key moments yet."}</p>;
  }
  return (
    <ol className="relative space-y-1">
      <span aria-hidden className="absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-white/[.06]" />
      {events.map((e, i) => {
        if (e.kind === "break") {
          return (
            <li key={i} className="relative flex justify-center py-2">
              <span className="relative rounded-full bg-ink-800 px-3 py-1 font-mono text-[10.5px] tracking-wide text-mist-500 uppercase ring-1 ring-white/[.06]">
                {e.label}
              </span>
            </li>
          );
        }
        const { main, sub } = eventText(e);
        const home = e.side === "home";
        return (
          <li key={i} className="relative grid grid-cols-[1fr_44px_1fr] items-center gap-2 py-1.5">
            <div className={cn("flex items-center gap-2.5", home ? "justify-end text-right" : "invisible")}>
              {home && <EventBody main={main} sub={sub} />}
              {home && <EventIcon kind={e.kind} />}
            </div>
            <span className="relative z-10 mx-auto rounded-full bg-ink-900 px-1.5 font-mono text-[11px] text-mist-300">{e.clock}</span>
            <div className={cn("flex items-center gap-2.5", !home ? "" : "invisible")}>
              {!home && <EventIcon kind={e.kind} />}
              {!home && <EventBody main={main} sub={sub} />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EventBody({ main, sub }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[13px] font-medium">{main}</span>
      {sub && <span className="block truncate text-[11px] text-mist-500">{sub}</span>}
    </span>
  );
}

/* ---------- line-ups: formations on a pitch ---------- */

// Row (0 keeper … 3.4 strikers) → distance from own goal line, as % of the half.
const ROW_DEPTH = { 0: 9, 1: 30, 1.5: 44, 2: 58, 2.6: 72, 3.4: 88 };

function place(starters, half) {
  const rows = new Map();
  for (const p of starters) {
    const key = ROW_DEPTH[p.row] != null ? p.row : 2;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(p);
  }
  const placed = [];
  for (const [row, players] of rows) {
    players.sort((a, b) => a.lane - b.lane);
    players.forEach((p, i) => {
      const x = ((i + 1) / (players.length + 1)) * 100;
      const depth = ROW_DEPTH[row] / 2; // 0–50% of the pitch height
      // Home attacks upward from the bottom; away is mirrored (their left is our right).
      placed.push({ ...p, x: half === "home" ? x : 100 - x, y: half === "home" ? 100 - depth : depth });
    });
  }
  return placed;
}

function Lineups({ match, onOpenPlayer }) {
  const { home, away } = match.lineups;
  const goals = new Map();
  for (const e of match.events) if (e.kind === "goal" && e.players[0]) goals.set(e.players[0], (goals.get(e.players[0]) ?? 0) + 1);
  const cards = new Map();
  for (const e of match.events) if ((e.kind === "yellow" || e.kind === "red") && e.players[0]) cards.set(e.players[0], e.kind);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: AWAY }} />
          {match.away.short} <span className="font-mono text-mist-500">{away.formation}</span>
        </span>
        <span className="text-mist-700">top</span>
      </div>

      <div className="relative mx-auto aspect-[2/3] w-full max-w-md overflow-hidden rounded-2xl bg-gradient-to-b from-[#123b1d] via-[#164a24] to-[#123b1d] ring-1 ring-white/10">
        {/* Pitch markings */}
        <svg viewBox="0 0 200 300" className="absolute inset-0 size-full" preserveAspectRatio="none" aria-hidden>
          {[...Array(6)].map((_, i) => (
            <rect key={i} x="0" y={i * 50} width="200" height="25" fill="rgb(255 255 255 / .025)" />
          ))}
          <g fill="none" stroke="rgb(255 255 255 / .28)" strokeWidth="1.2">
            <rect x="6" y="6" width="188" height="288" rx="2" />
            <line x1="6" y1="150" x2="194" y2="150" />
            <circle cx="100" cy="150" r="24" />
            <rect x="50" y="6" width="100" height="40" />
            <rect x="78" y="6" width="44" height="14" />
            <rect x="50" y="254" width="100" height="40" />
            <rect x="78" y="280" width="44" height="14" />
          </g>
        </svg>
        {[...place(away.starters, "away").map((p) => ({ ...p, team: "away" })), ...place(home.starters, "home").map((p) => ({ ...p, team: "home" }))].map((p) => (
          <button
            key={`${p.team}-${p.number}-${p.name}`}
            onClick={() => onOpenPlayer(p)}
            title={`${p.name}: match stats & profile`}
            className="group absolute flex w-16 -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span
              className="relative grid size-7 place-items-center rounded-full font-mono text-[11px] font-bold text-white shadow-lg ring-2 ring-white/80 transition group-hover:scale-110 group-hover:ring-white sm:size-8"
              style={{ background: p.team === "home" ? HOME : AWAY }}
            >
              {p.number}
              {goals.get(p.name) && (
                <span className="absolute -top-1.5 -right-2.5 flex items-center gap-px font-mono text-[9px] font-bold">
                  <BallIcon className="size-3" />
                  {goals.get(p.name) > 1 ? goals.get(p.name) : ""}
                </span>
              )}
              {cards.get(p.name) && (
                <span className={cn("absolute -top-1 -left-1.5 h-3 w-2 rounded-[1px]", cards.get(p.name) === "red" ? "bg-live" : "bg-yellow-400")} />
              )}
              {p.subbedOut && <ArrowDown className="absolute -right-2 -bottom-1 size-3 rounded-full bg-ink-900 text-live" />}
            </span>
            <span className="mt-0.5 max-w-full truncate rounded bg-black/45 px-1 text-[9.5px] leading-tight font-medium text-white sm:text-[10.5px]">
              {lastName(p.short || p.name)}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: HOME }} />
          {match.home.short} <span className="font-mono text-mist-500">{home.formation}</span>
        </span>
        <span className="text-mist-700">bottom</span>
      </div>

      {/* Benches */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        {[
          { side: home, team: match.home },
          { side: away, team: match.away },
        ].map(({ side, team }) => (
          <div key={team.name}>
            <p className="mb-2 font-mono text-[10.5px] tracking-[.16em] text-mist-500 uppercase">{team.short} bench</p>
            <ul className="space-y-1.5">
              {side.bench.map((p) => (
                <li key={`${p.number}-${p.name}`}>
                  <button onClick={() => onOpenPlayer(p)} className="flex w-full items-center gap-2 rounded-lg py-0.5 text-left text-[12.5px] transition hover:bg-white/[.04]">
                    <span className="w-5 text-right font-mono text-[11px] text-mist-500">{p.number}</span>
                    <span className={cn("truncate", p.subbedIn ? "text-mist-100" : "text-mist-500")}>{p.name}</span>
                    {p.subbedIn && <ArrowUp className="size-3 shrink-0 text-signal" aria-label="Came on" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- stats ---------- */

function Stats({ match }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-[12px] text-mist-300">
        <span className="flex items-center gap-2">
          <span className="size-2.5 rounded-full" style={{ background: HOME }} /> {match.home.short}
        </span>
        <span className="flex items-center gap-2">
          {match.away.short} <span className="size-2.5 rounded-full" style={{ background: AWAY }} />
        </span>
      </div>
      <ul className="space-y-4">
        {match.stats.map((s) => {
          const h = Number(s.home) || 0;
          const a = Number(s.away) || 0;
          const total = h + a || 1;
          return (
            <li key={s.key}>
              <div className="mb-1.5 flex items-center justify-between text-[13px]">
                <span className={cn("font-mono tabular-nums", h > a && "font-bold")}>
                  {s.home}
                  {s.unit}
                </span>
                <span className="text-mist-500">{s.label}</span>
                <span className={cn("font-mono tabular-nums", a > h && "font-bold")}>
                  {s.away}
                  {s.unit}
                </span>
              </div>
              <div className="flex h-1.5 gap-0.5">
                <div className="flex flex-1 justify-end overflow-hidden rounded-l-full bg-white/[.05]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(h / total) * 100}%` }} className="h-full rounded-l-full" style={{ background: HOME }} />
                </div>
                <div className="flex-1 overflow-hidden rounded-r-full bg-white/[.05]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(a / total) * 100}%` }} className="h-full rounded-r-full" style={{ background: AWAY }} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- league table ---------- */

function Table({ rows }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="font-mono text-[10.5px] tracking-wide text-mist-500 uppercase">
          <th className="w-8 pb-2 text-left font-medium">#</th>
          <th className="pb-2 text-left font-medium">Team</th>
          <th className="w-10 pb-2 text-right font-medium">P</th>
          <th className="w-12 pb-2 text-right font-medium">GD</th>
          <th className="w-12 pb-2 text-right font-medium">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.team} className={cn("border-t border-white/[.04]", r.highlight && "bg-signal/[.07] text-mist-100")}>
            <td className="py-2 font-mono text-mist-500">{r.rank}</td>
            <td className={cn("py-2", r.highlight ? "font-semibold" : "text-mist-300")}>{r.team}</td>
            <td className="py-2 text-right font-mono text-mist-500">{r.played}</td>
            <td className="py-2 text-right font-mono text-mist-500">{r.gd}</td>
            <td className="py-2 text-right font-mono font-semibold">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


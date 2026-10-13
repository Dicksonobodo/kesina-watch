import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarPlus, ChevronRight, ListOrdered, Newspaper, RefreshCw, Trophy, Tv } from "lucide-react";
import { LiveDot } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/cn";
import { reportError } from "@/lib/monitoring";
import { MatchCentre } from "./MatchCentre";
import { LeagueLeaders } from "./LeagueLeaders";
import { PlayerSheet, TeamSheet } from "./Sheets";
import { SearchBox, StandingsView } from "./SportsExtras";
import { BallIcon } from "@/components/ui/BallIcon";

// Served by Vercel functions on the same site (api/sports/*), independent of the detection server.
async function getJson(path) {
  let res;
  try {
    res = await fetch(path, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error(navigator.onLine ? "Scores are unavailable right now." : "You're offline.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Scores are unavailable right now.");
  return data;
}

const DAYS = [
  { day: -1, label: "Yesterday" },
  { day: 0, label: "Today" },
  { day: 1, label: "Tomorrow" },
  { day: 2, label: null },
  { day: 3, label: null },
];

const dayLabel = (d) => d.label ?? new Date(Date.now() + d.day * 86_400_000).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
const kickoffTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** Live scores, fixtures, results, tables and stats for football and other sports, with search. */
export function SportsPage() {
  const [sport, setSport] = useState("football");
  const [day, setDay] = useState(0);
  const [league, setLeague] = useState("all");
  const [view, setView] = useState("matches"); // matches | table
  const [sheet, setSheet] = useState(null); // { kind: "team" | "player", league, id, name }
  const [data, setData] = useState(null);
  const [news, setNews] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState(null); // match shown in the match centre

  // Matches: refresh every 30s while anything is live today, every 2 minutes otherwise.
  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = async () => {
      setRefreshing(true);
      try {
        const next = await getJson(`/api/sports/matches?day=${day}&sport=${sport}`);
        if (!cancelled) {
          setData(next);
          setError("");
        }
        timer = setTimeout(load, next.live ? 30_000 : 120_000);
      } catch (err) {
        if (!cancelled) setError(err.message);
        timer = setTimeout(load, 60_000);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    };
    setData(null);
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [day, sport]);

  useEffect(() => {
    getJson("/api/sports/news")
      .then((d) => setNews(d.items))
      .catch((err) => {
        setNews([]);
        reportError(err, { where: "sports-news" });
      });
  }, []);

  const sports = data?.sports ?? [{ id: "football", name: "Football" }];
  const leagues = useMemo(() => {
    // Competitions with games on this day come first.
    const list = data?.leagues ?? [];
    return [...list].sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
  }, [data]);
  const current = leagues.find((l) => l.id === league);
  // The table and leaders need one competition: the picked one, or the first with games.
  const focusLeague = current ?? leagues[0];
  const isFootball = sport === "football";
  // The table is for one competition, so show which one even when "All" is picked.
  const shownLeague = view === "table" ? focusLeague?.id ?? league : league;

  function changeSport(next) {
    if (next === sport) return;
    setSport(next);
    setLeague("all");
    setView("matches");
    setData(null);
  }

  function openCompetition(c) {
    if (c.sport !== sport) setData(null);
    setSport(c.sport);
    setLeague(c.id);
    setView("matches");
  }
  const matches = useMemo(() => (data?.matches ?? []).filter((m) => league === "all" || m.league === league), [data, league]);
  const live = matches.filter((m) => m.state === "in");
  const rest = matches.filter((m) => m.state !== "in");
  const byLeague = useMemo(() => {
    const groups = new Map();
    for (const m of rest) {
      if (!groups.has(m.leagueName)) groups.set(m.leagueName, []);
      groups.get(m.leagueName).push(m);
    }
    return [...groups.entries()];
  }, [rest]);

  return (
    <div>
      <PageHeader
        eyebrow={sports.find((x) => x.id === sport)?.name ?? "Sports"}
        title="Sports"
        description="Live scores, fixtures, tables and stats across football, basketball, NFL, baseball and hockey, with where to watch each match."
        action={
          data?.live > 0 && (
            <span className="inline-flex items-center gap-2 self-start rounded-full bg-live/10 px-3.5 py-2 font-mono text-xs font-medium text-live ring-1 ring-live/30 sm:self-auto">
              <LiveDot /> {data.live} live now
            </span>
          )
        }
      />

      <div className="mt-6">
        <SearchBox
          matches={data?.matches}
          onCompetition={openCompetition}
          onMatch={(m) => setOpen(m)}
          onTeam={(t) => setSheet({ kind: "team", league: t.league, id: t.id, name: t.name })}
          onPlayer={(p) => setSheet({ kind: "player", league: p.league, id: p.id, name: p.name })}
        />
      </div>

      {/* Sport, competition, view and day pickers */}
      <div className="mt-5 space-y-3">
        <Chips value={sport} onChange={changeSport} options={sports.map((x) => ({ value: x.id, label: x.name }))} layoutId="sports-sport" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {[{ id: "all", short: "All", count: data?.matches?.length ?? 0 }, ...leagues].map((l) => (
            <button
              key={l.id}
              onClick={() => setLeague(l.id)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition",
                shownLeague === l.id ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-500 ring-white/10 hover:text-mist-100",
                shownLeague !== l.id && l.count === 0 && l.id !== "all" && "opacity-60",
              )}
            >
              {l.short}
              {l.count > 0 && <span className="rounded-full bg-white/10 px-1.5 font-mono text-[10px] text-mist-300">{l.count}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Chips
            value={view}
            onChange={setView}
            options={[
              { value: "matches", label: "Matches" },
              { value: "table", label: "Table" },
            ]}
            layoutId="sports-view"
          />
          {view === "matches" && <Chips value={day} onChange={setDay} options={DAYS.map((d) => ({ value: d.day, label: dayLabel(d) }))} layoutId="sports-day" />}
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-2xl bg-live/[.08] px-4 py-3 text-sm text-live ring-1 ring-live/25">{error}</p>
      )}

      {view === "table" && (
        <section className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">
            <ListOrdered className="size-3.5" /> {focusLeague ? `${focusLeague.name} table` : "Table"}
          </h2>
          {focusLeague ? (
            <StandingsView key={focusLeague.id} league={focusLeague.id} leagueName={focusLeague.name} onTeam={(id) => setSheet({ kind: "team", league: focusLeague.id, id })} />
          ) : (
            <div className="skeleton h-96 rounded-3xl" />
          )}
        </section>
      )}

      {/* Live now */}
      <AnimatePresence>
        {view === "matches" && live.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium tracking-[.22em] text-live uppercase">
              <LiveDot /> Live now
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {live.map((m) => (
                <LiveCard key={m.id} match={m} onOpen={() => setOpen(m)} />
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Fixtures & results */}
      <section className={cn("mt-8", view !== "matches" && "hidden")}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">{day < 0 ? "Results" : "Fixtures & results"}</h2>
          {refreshing && data && <RefreshCw className="size-3.5 animate-spin text-mist-700" />}
        </div>

        {!data && !error ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ) : byLeague.length === 0 && live.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-white/[.08] px-6 py-12 text-center">
            <Trophy className="size-8 text-mist-700" />
            <p className="mt-4 font-semibold">No matches {day === 0 ? "today" : "on this day"}</p>
            <p className="mt-1 text-sm text-mist-500">Try another day or league.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {byLeague.map(([name, list]) => (
              <div key={name}>
                <p className="mb-2 pl-1 text-[13px] font-semibold text-mist-300">{name}</p>
                <div className="divide-y divide-white/[.05] overflow-hidden rounded-2xl bg-white/[.025] ring-1 ring-white/[.06]">
                  {list.map((m) => (
                    <MatchRow key={m.id} match={m} onOpen={() => setOpen(m)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs leading-relaxed text-mist-700">
          Broadcasters shown are the official rights holders listed for the match (mostly US). Check your local broadcaster: in Nigeria that&apos;s usually DStv / SuperSport or Showmax.
        </p>
      </section>

      {isFootball && focusLeague && <LeagueLeaders key={focusLeague.id} league={focusLeague.id} leagueName={focusLeague.name} />}

      {/* News */}
      <section className={cn("mt-12", !isFootball && "hidden")}>
        <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-bold tracking-tight">
          <Newspaper className="size-5 text-signal" /> Football news
        </h2>
        {!news ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton aspect-[4/3] rounded-3xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {news.slice(0, 18).map((n, i) => (
              <NewsCard key={n.id} item={n} featured={i === 0} />
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>{open && <MatchCentre match={open} onClose={() => setOpen(null)} />}</AnimatePresence>
      <AnimatePresence>
        {sheet?.kind === "team" && (
          <TeamSheet key={`t${sheet.id}`} league={sheet.league} id={sheet.id} onClose={() => setSheet(null)} onOpenPlayer={(p) => setSheet({ kind: "player", league: sheet.league, id: p.id, name: p.name })} />
        )}
        {sheet?.kind === "player" && (
          <PlayerSheet
            key={`p${sheet.id}`}
            league={sheet.league}
            id={sheet.id}
            name={sheet.name}
            onClose={() => setSheet(null)}
            onOpenTeam={(id) => setSheet({ kind: "team", league: sheet.league, id })}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- pieces ---------- */

function Chips({ value, onChange, options, layoutId }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-full bg-white/[.03] p-1 ring-1 ring-white/[.06]">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn("relative h-9 rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition", value === o.value ? "text-ink-950" : "text-mist-500 hover:text-mist-100")}
          >
            {value === o.value && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-mist-100" transition={{ type: "spring", stiffness: 450, damping: 36 }} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamLogo({ team, size = "size-7" }) {
  const [failed, setFailed] = useState(false);
  if (!team.logo || failed) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[9px] font-bold", size)}>{team.abbr?.slice(0, 3)}</span>
    );
  }
  return <img src={team.logo} alt="" loading="lazy" onError={() => setFailed(true)} className={cn("shrink-0 object-contain", size)} />;
}

// Flashes the score when it changes (a goal).
function useFlash(value) {
  const prev = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (prev.current !== value && prev.current != null) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 2500);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return flash;
}

// "Saka 23', Ødegaard 61' (pen)" with ball icons under a result; red cards too.
function Moments({ match, side, className }) {
  const list = (match.moments ?? []).filter((x) => x.side === side);
  if (!list.length) return null;
  return (
    <p className={cn("truncate text-[11px] text-mist-500", className)}>
      {list.map((x, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {x.kind === "red" ? <span className="mr-0.5 inline-block h-2.5 w-[7px] translate-y-px rounded-[1px] bg-live" /> : <BallIcon className="mr-1 size-3 -translate-y-px align-middle" />}
          {x.player} {x.clock}
          {x.penalty ? " (pen)" : x.ownGoal ? " (og)" : ""}
        </span>
      ))}
    </p>
  );
}

function LiveCard({ match: m, onOpen }) {
  const flash = useFlash(`${m.home.score}-${m.away.score}`);
  return (
    <button
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-br from-live/[.12] via-white/[.02] to-transparent p-5 text-left ring-1 ring-live/25 transition hover:ring-live/50"
    >
      <div className="flex items-center justify-between text-[12px]">
        <span className="text-mist-300">{m.leagueName}</span>
        <span className="flex items-center gap-1.5 font-mono font-medium text-live">
          <LiveDot /> {m.clock || m.detail}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <TeamLogo team={m.home} size="size-11" />
          <span className="w-full truncate text-sm font-semibold">{m.home.short}</span>
          <Moments match={m} side="home" className="w-full text-center" />
        </div>
        <motion.div
          animate={flash ? { scale: [1, 1.18, 1] } : {}}
          className={cn("rounded-2xl px-4 py-2 font-display text-3xl font-bold tabular-nums transition-colors", flash ? "bg-signal text-ink-950" : "bg-black/30")}
        >
          {m.home.score ?? 0}
          <span className="mx-1.5 text-mist-500">–</span>
          {m.away.score ?? 0}
        </motion.div>
        <div className="flex min-w-0 flex-col items-center gap-2 text-center">
          <TeamLogo team={m.away} size="size-11" />
          <span className="w-full truncate text-sm font-semibold">{m.away.short}</span>
          <Moments match={m} side="away" className="w-full text-center" />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <WhereToWatch match={m} />
        <span className="ml-auto shrink-0 text-[12px] font-semibold text-mist-300">Line-ups & stats →</span>
      </div>
    </button>
  );
}

function MatchRow({ match: m, onOpen }) {
  const done = m.state === "post";
  const flash = useFlash(`${m.home.score}-${m.away.score}`);
  return (
    <div className="group grid grid-cols-[56px_1fr_auto] items-center gap-3 px-3 py-3 transition hover:bg-white/[.025] sm:grid-cols-[72px_1fr_auto] sm:px-4">
      <button onClick={onOpen} className="contents text-left" aria-label={`${m.home.name} vs ${m.away.name}: match details`}>
        <span className="text-center font-mono text-[11px] leading-tight text-mist-500">
          {done ? <span className="text-mist-300">FT</span> : m.state === "pre" ? kickoffTime(m.kickoff) : <span className="text-live">{m.clock || m.detail}</span>}
        </span>
        <span className="min-w-0 space-y-1.5">
          {[
            { t: m.home, side: "home" },
            { t: m.away, side: "away" },
          ].map(({ t, side }) => (
            <span key={side} className="block">
              <span className="flex items-center gap-2.5">
                <TeamLogo team={t} size="size-5" />
                <span className={cn("min-w-0 flex-1 truncate text-sm", done && !t.winner ? "text-mist-500" : "font-medium")}>{t.name}</span>
                {m.state !== "pre" && (
                  <span className={cn("w-6 text-right font-mono text-sm tabular-nums", flash && "text-signal", done && t.winner && "font-bold")}>{t.score}</span>
                )}
              </span>
              <Moments match={m} side={side} className="pl-7.5" />
            </span>
          ))}
          {m.state === "pre" && <WhereToWatch match={m} compact />}
        </span>
      </button>
      <div className="flex items-center gap-1">
        {m.state === "pre" && (
          <button
            onClick={() => downloadIcs(m)}
            className="grid size-9 place-items-center rounded-full text-mist-500 transition hover:bg-white/[.06] hover:text-signal"
            aria-label="Add to calendar"
            title="Add to calendar (reminder)"
          >
            <CalendarPlus className="size-4" />
          </button>
        )}
        <button
          onClick={onOpen}
          className="grid size-9 place-items-center rounded-full text-mist-500 transition group-hover:text-mist-100 hover:bg-white/[.06]"
          aria-label="Match details"
          title="Line-ups, stats & table"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function WhereToWatch({ match, compact, className }) {
  if (!match.broadcasters?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Tv className={cn("text-mist-500", compact ? "size-3" : "size-3.5")} />
      {match.broadcasters.map((b) => (
        <span key={b} className={cn("rounded-md bg-white/[.06] text-mist-300", compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]")}>
          {b}
        </span>
      ))}
    </div>
  );
}

function NewsCard({ item, featured }) {
  const ago = timeAgo(item.published);
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:ring-white/15",
        featured && "sm:col-span-2 lg:col-span-2 lg:row-span-2",
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-ink-800">
        {item.image && !imgFailed ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="size-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <NewsArt item={item} />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-medium tracking-wide text-white uppercase backdrop-blur">
          {item.source}
        </span>
      </div>
      <div className="p-4">
        <p className={cn("font-semibold tracking-tight text-balance", featured ? "text-xl sm:text-2xl" : "text-[15px]")}>{item.title}</p>
        {featured && item.summary && <p className="mt-2 line-clamp-3 text-sm text-mist-500">{item.summary}</p>}
        <p className="mt-2 font-mono text-[11px] text-mist-700">{ago}</p>
      </div>
    </a>
  );
}

// When a story has no usable picture: a designed card in the source's colours, with the headline's first words.
const SOURCE_TINT = { "BBC Sport": ["#ffd230", "#2a2a12"], "Sky Sports": ["#e10a1e", "#22070b"], ESPN: ["#d00", "#200608"] };

function NewsArt({ item }) {
  const [accent, deep] = SOURCE_TINT[item.source] ?? ["#c6ff3d", "#0f1a06"];
  const words = item.title.split(" ").slice(0, 4).join(" ");
  return (
    <div
      className="relative size-full"
      style={{ background: `radial-gradient(120% 90% at 85% 10%, ${accent}55, transparent 60%), linear-gradient(160deg, ${deep}, #08080b)` }}
    >
      <Trophy className="absolute -right-4 -bottom-6 size-36 rotate-12 opacity-[.08]" style={{ color: accent }} />
      <p className="absolute inset-x-5 bottom-5 font-display text-2xl leading-[1.05] font-extrabold tracking-tight text-white/90 uppercase">{words}</p>
    </div>
  );
}

function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// Calendar reminder that works on every phone and computer (no notifications permission needed).
function downloadIcs(m) {
  const start = new Date(m.kickoff);
  const end = new Date(start.getTime() + 2 * 3600_000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dixon Watch//Sports//EN",
    "BEGIN:VEVENT",
    `UID:${m.id}@dixon.watch`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${m.home.name} vs ${m.away.name}`,
    `DESCRIPTION:${m.leagueName}${m.broadcasters?.length ? ` · Watch on ${m.broadcasters.join(", ")}` : ""}`,
    m.venue ? `LOCATION:${m.venue}` : null,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Kick-off in 15 minutes",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  a.download = `${m.home.short}-vs-${m.away.short}.ics`.replace(/\s+/g, "-");
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}

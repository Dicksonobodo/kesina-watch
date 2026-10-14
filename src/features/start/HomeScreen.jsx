import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, CalendarCheck, Coins, Flame, Gamepad2, Newspaper, Play, Radio, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LiveDot } from "@/components/ui/Badge";
import { useAuth } from "@/features/auth/AuthProvider";
import { XpBar } from "@/features/games/GamesProvider";
import { gamesApi } from "@/lib/games";
import { greeting } from "@/lib/format";
import { useUserCollection } from "@/lib/userData";
import { cn } from "@/lib/cn";
import { HOME_CREDITS } from "@/features/games/photoCredits";

/*
 * The home screen: a photo hero, what's live right now, the three things Dixon Watch does
 * (each with a photo), the player's game progress, pinned channels and the latest football news.
 */

const ease = [0.22, 1, 0.36, 1];

function useJson(url) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(url, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.json())
      .then((d) => live && setData(d))
      .catch(() => live && setData({ error: true }));
    return () => {
      live = false;
    };
  }, [url]);
  return data;
}

export function HomeScreen() {
  const [params] = useSearchParams();
  const link = params.get("u");
  // Links shared into the app (?u=<stream page>, the bookmarklet and Android Share) go straight to Live.
  if (link) return <Navigate to={`/live?u=${encodeURIComponent(link)}`} replace />;
  return <HomeContent />;
}

function HomeContent() {
  const { user } = useAuth();
  const first = (user?.displayName || "").split(" ")[0];
  const sports = useJson("/api/sports/matches?day=0&sport=football");
  const news = useJson("/api/sports/news");
  const { items: sites } = useUserCollection(user?.uid, "sites");
  const channels = sites.filter((s) => s.kind === "live").slice(0, 4);
  const [game, setGame] = useState(null);
  useEffect(() => {
    gamesApi("home.summary").then(setGame).catch(() => setGame({ profile: null }));
  }, []);

  const matches = sports?.matches ?? [];
  const liveMatches = matches.filter((m) => m.state === "in");
  const upcoming = matches.filter((m) => m.state === "pre").slice(0, 3);
  const showing = liveMatches.length ? liveMatches.slice(0, 3) : upcoming;

  return (
    <div className="space-y-12">
      {/* ---------- hero ---------- */}
      <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="relative isolate overflow-hidden rounded-[32px] ring-1 ring-white/10">
        <img src="/home/hero.webp" alt="" className="absolute inset-0 -z-10 size-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-ink-950/95 via-ink-950/60 to-ink-950/10" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />
        <div className="px-6 py-12 sm:px-10 sm:py-16 lg:py-20">
          <p className="font-mono text-[11px] font-medium tracking-[.22em] text-signal uppercase">
            {greeting()}
            {first && `, ${first}`}
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-[clamp(32px,4.8vw,60px)] leading-[1] font-extrabold tracking-[-0.035em] text-balance">
            Football, live scores and games.
            <br />
            <span className="text-signal">No ads in the way.</span>
          </h1>
          <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-mist-300">Watch live streams cleanly, follow every match across 35+ competitions, and play quizzes and predictions with your friends.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/live">
              <Button size="lg">
                <Play className="size-[18px]" /> Watch live
              </Button>
            </Link>
            <Link to="/sports">
              <Button size="lg" variant="ghost">
                <Trophy className="size-[18px]" /> Live scores
              </Button>
            </Link>
            <Link to="/games">
              <Button size="lg" variant="ghost">
                <Gamepad2 className="size-[18px]" /> Play games
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

      {/* ---------- right now ---------- */}
      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              {liveMatches.length > 0 && <LiveDot />} {liveMatches.length > 0 ? `${liveMatches.length} live right now` : "Next matches today"}
            </h2>
            <p className="mt-1 text-sm text-mist-500">{liveMatches.length > 0 ? "Scores update every 30 seconds." : "Nothing live at the moment."}</p>
          </div>
          <Link to="/sports" className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-mist-500 transition hover:text-signal">
            All scores <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {!sports ? (
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-28 rounded-3xl" />
            ))}
          </div>
        ) : showing.length === 0 ? (
          <Link to="/sports" className="block rounded-3xl border border-dashed border-white/[.1] px-6 py-8 text-center text-sm text-mist-500 transition hover:text-mist-100">
            No more matches today. See fixtures for the next few days →
          </Link>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {showing.map((m) => (
              <MatchTile key={m.id} match={m} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- the three things ---------- */}
      <section className="grid gap-3 md:grid-cols-3">
        {[
          { to: "/live", img: "live", title: "Live streams, cleaned", text: "Paste a concert, show or channel page. We find every live stream on it and play them ad-free.", icon: Radio },
          { to: "/sports", img: "sports", title: "Every match, every score", text: "Live scores, tables, line-ups, highlights and stats for football, basketball, NFL and more.", icon: Trophy },
          { to: "/games", img: "games", title: "Play with friends", text: "Quizzes, match predictions and head-to-head battles. Earn XP and climb the weekly board.", icon: Gamepad2 },
        ].map((c, i) => (
          <motion.div key={c.to} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06, duration: 0.4 }}>
            <Link to={c.to} className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:ring-signal/40">
              <div className="relative h-44 overflow-hidden">
                <img src={`/home/${c.img}.webp`} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-ink-950/10 to-transparent" />
                <span className="absolute bottom-3 left-3 grid size-10 place-items-center rounded-xl bg-black/55 ring-1 ring-white/15 backdrop-blur">
                  <c.icon className="size-5 text-signal" />
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg font-bold tracking-tight">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-mist-500">{c.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-signal">
                  Open <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </section>

      {/* ---------- your games + your channels ---------- */}
      <section className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <GameStrip game={game} />
        <div className="rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06] sm:p-6">
          <h3 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
            <Radio className="size-4 text-live" /> Your channels
          </h3>
          {channels.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-mist-500">Pin a live page and it shows up here for one-tap watching.</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {channels.map((c) => (
                <li key={c.id}>
                  <Link to={`/live?u=${encodeURIComponent(c.url)}`} className="flex items-center gap-3 rounded-2xl bg-white/[.04] px-3.5 py-2.5 ring-1 ring-white/[.06] transition hover:bg-white/[.07]">
                    <LiveDot />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span>
                    <Play className="size-3.5 text-mist-500" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to="/live" className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-signal">
            Find a stream <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>

      {/* ---------- news ---------- */}
      {news?.items?.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <h2 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              <Newspaper className="size-5 text-signal" /> Latest football news
            </h2>
            <Link to="/sports" className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-mist-500 transition hover:text-signal">
              More <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {news.items.slice(0, 3).map((n) => (
              <a key={n.id ?? n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:ring-white/15">
                <div className="relative aspect-[16/9] bg-ink-800">
                  {n.image && <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition duration-500 group-hover:scale-105" onError={(e) => (e.currentTarget.style.display = "none")} />}
                  <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] tracking-wide text-white uppercase backdrop-blur">{n.source}</span>
                </div>
                <p className="p-4 text-[15px] leading-snug font-semibold tracking-tight">{n.title}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      <p className="text-[11px] leading-relaxed text-mist-700">
        Photos from{" "}
        <a href="https://unsplash.com/?utm_source=dixon_watch&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-mist-300">
          Unsplash
        </a>
        :{" "}
        {HOME_CREDITS.map((c, i) => (
          <span key={c.page}>
            <a href={`${c.profile}?utm_source=dixon_watch&utm_medium=referral`} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-mist-300">
              {c.photographer}
            </a>
            {i < HOME_CREDITS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </div>
  );
}

function Crest({ t }) {
  return t.logo ? <img src={t.logo} alt="" loading="lazy" className="size-8 shrink-0 object-contain" /> : <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 font-mono text-[9px] font-bold">{t.abbr?.slice(0, 3)}</span>;
}

function MatchTile({ match: m }) {
  const live = m.state === "in";
  return (
    <Link to="/sports" className={cn("block rounded-3xl p-4 ring-1 transition hover:-translate-y-0.5", live ? "bg-gradient-to-br from-live/[.1] to-transparent ring-live/25 hover:ring-live/50" : "bg-white/[.025] ring-white/[.06] hover:ring-white/15")}>
      <div className="flex items-center justify-between text-[12px] text-mist-500">
        <span className="truncate">{m.leagueName}</span>
        <span className={cn("shrink-0 font-mono font-medium", live && "text-live")}>
          {live ? (
            <>
              <LiveDot /> {m.clock || m.detail}
            </>
          ) : (
            new Date(m.kickoff).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          )}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {[m.home, m.away].map((t, i) => (
          <div key={i} className="flex items-center gap-3">
            <Crest t={t} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
            {m.state !== "pre" && <span className="font-display text-xl font-bold tabular-nums">{t.score}</span>}
          </div>
        ))}
      </div>
    </Link>
  );
}

function GameStrip({ game }) {
  const p = game?.profile;
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-signal/[.1] via-white/[.02] to-transparent p-5 ring-1 ring-signal/20 sm:p-6">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
        <Gamepad2 className="size-4 text-signal" /> Your games
      </h3>
      {game === null ? (
        <div className="skeleton mt-4 h-20 rounded-2xl" />
      ) : !p ? (
        <>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-mist-300">Take a quick quiz to start your streak. Every game earns XP and coins, and your first one unlocks your first badge.</p>
          <Link to="/games" className="mt-4 inline-block">
            <Button>Start playing</Button>
          </Link>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.05] px-3 py-1.5 text-[13px] font-semibold ring-1 ring-white/10">
              <Flame className="size-4 text-signal" /> {p.streak}-day streak
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[.05] px-3 py-1.5 text-[13px] font-semibold ring-1 ring-white/10">
              <Coins className="size-4 text-signal" /> {p.coins}
            </span>
          </div>
          <div className="mt-4">
            <XpBar profile={p} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to={game.daily?.quizDone && game.daily?.guessDone ? "/games" : "/games/daily"}>
              <Button size="sm">
                <CalendarCheck className="size-4" /> {game.daily?.quizDone && game.daily?.guessDone ? "Today's challenge done" : "Daily challenge"}
              </Button>
            </Link>
            <Link to="/games">
              <Button size="sm" variant="ghost">
                All games
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

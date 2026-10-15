import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpDown, Brain, CalendarCheck, Coins, Crown, Flame, Footprints, Grid3x3, Handshake, LayoutGrid, MessageCircle, Medal, PenLine, Route, Search, Shirt, Spline, Swords, Target, Trophy, UserSearch } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { StatChip, useGames, XpBar } from "./GamesProvider";
import { GameArt } from "./art";
import { PHOTO_CREDITS } from "./photoCredits";
import { useChat } from "./chat/ChatProvider";
import { ErrorNote, Eyebrow, PlayerChip } from "./ui";

export const GAMES = [
  { id: "hilo", to: "/games/hilo", title: "Higher or Lower", desc: "Who has more goals this season? One wrong answer ends your streak.", icon: ArrowUpDown, tag: "Streaks" },
  { id: "footle", to: "/games/footle", title: "Footle", desc: "Guess the footballer in 8 tries. Every guess shows how close you are.", icon: Spline, tag: "Daily" },
  { id: "grid", to: "/games/grid", title: "Club Grid", desc: "Fill 9 squares with players who wore both clubs' shirts.", icon: Grid3x3, tag: "Daily" },
  { id: "keepy", to: "/games/keepy", title: "Keepie-Uppie", desc: "No questions. Tap the ball to keep it up as long as you can.", icon: Footprints, tag: "Skill" },
  { id: "career", to: "/games/career", title: "Career Path", desc: "Clubs appear one by one. Name the player before the path ends.", icon: Route },
  { id: "predictor", to: "/games/predictor", title: "Match Predictor", desc: "Call the result before kickoff and compete with friends in a league.", icon: Target, tag: "Matchday" },
  { id: "quiz", to: "/games/quiz", title: "Football IQ Quiz", desc: "10 questions, 15 seconds each. Faster answers score more.", icon: Brain },
  { id: "guess", to: "/games/guess", title: "Guess the Player", desc: "Clues appear one by one. The fewer you need, the more you win.", icon: UserSearch },
  { id: "shirt", to: "/games/shirt", title: "Guess the Shirt Number", desc: "Which number does this player wear?", icon: Shirt },
  { id: "clubs", to: "/games/clubs", title: "Who Played for Both?", desc: "Two clubs. One player has worn both shirts.", icon: Handshake },
  { id: "trophy", to: "/games/trophy", title: "Name the Trophy", desc: "Work out the trophy from the clue.", icon: Trophy },
  { id: "xi", to: "/games/xi", title: "Complete the XI", desc: "A real recent line-up with three players missing.", icon: LayoutGrid },
  { id: "submit", to: "/games/submit", title: "Write a Question", desc: "Add your own. Approved questions earn you XP and coins.", icon: PenLine, tag: "Community" },
];

export function GamesHub() {
  const { loading, error, profile, daily } = useGames();
  const chat = useChat();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return GAMES;
    return GAMES.filter((g) => words.every((w) => `${g.title} ${g.desc} ${g.tag ?? ""}`.toLowerCase().includes(w)));
  }, [query]);

  return (
    <div>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
        <div>
          <p className="font-mono text-[11px] font-medium tracking-[.22em] text-mist-500 uppercase">Games</p>
          <h1 className="mt-1 font-display text-[clamp(30px,5vw,52px)] leading-none font-extrabold tracking-[-0.03em] sm:mt-2">Game Zone</h1>
          <p className="mt-3 hidden max-w-lg text-[15px] text-mist-500 sm:block">Quizzes, predictions, battles and chat games. Earn XP, keep your streak, climb the weekly board.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={chat.openPanel} className="relative inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-white/15 transition hover:bg-white/[.06] sm:h-10 sm:gap-2 sm:px-4 sm:text-sm">
            <MessageCircle className="size-4 text-signal" /> Messages
            {chat.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-live px-1.5 text-[11px] leading-5 font-bold text-white">{chat.unread}</span>}
          </button>
          <Link to="/games/leaderboard" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-white/15 transition hover:bg-white/[.06] sm:h-10 sm:gap-2 sm:px-4 sm:text-sm">
            <Medal className="size-4 text-signal" /> Boards
          </Link>
          <Link to="/games/profile" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-white/15 transition hover:bg-white/[.06] sm:h-10 sm:gap-2 sm:px-4 sm:text-sm">
            <Crown className="size-4 text-signal" /> Profile
          </Link>
        </div>
      </header>

      {/* Head-to-Head: play against real people */}
      <div className="relative mt-5 overflow-hidden rounded-3xl ring-1 ring-rose-400/30 sm:mt-8">
        <GameArt id="battle" className="absolute inset-0 size-full opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/30" />
        <div className="relative p-5 sm:p-7">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-rose-200 uppercase ring-1 ring-rose-400/40">
            <span className="size-1.5 animate-pulse rounded-full bg-rose-400" /> Multiplayer
          </span>
          <h2 className="mt-3 font-display text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl">Head-to-Head</h2>
          <p className="mt-1.5 max-w-md text-sm text-mist-300">Play a friend or someone at your level: 7 football battles, plus Tic Tac Toe, Word Swipe, Naija Whot, Darts and Who's Behind You? in the chat.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/games/battle" className="inline-flex h-11 items-center gap-2 rounded-full bg-signal px-5 text-sm font-bold text-ink-950 transition hover:brightness-110">
              <Swords className="size-4" /> Start a battle
            </Link>
            <button onClick={chat.openPanel} className="inline-flex h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/15">
              <MessageCircle className="size-4 text-signal" /> Games in chat
            </button>
          </div>
        </div>
      </div>


      <ErrorNote>{error}</ErrorNote>

      {/* Player strip */}
      <div className="mt-3 grid gap-2.5 sm:mt-4 sm:gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl bg-gradient-to-br from-signal/[.1] via-white/[.02] to-transparent p-4 ring-1 ring-signal/20 sm:p-6">
          {loading ? (
            <div className="grid place-items-center py-6">
              <Spinner className="size-5 text-signal" />
            </div>
          ) : profile ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PlayerChip avatar={profile.avatar} name={profile.name} level={profile.level} />
                <div className="flex flex-wrap gap-2">
                  <StatChip icon={Flame} value={profile.streak} label="Day streak" tone={profile.playedToday ? undefined : "live"} />
                  <StatChip icon={Coins} value={profile.coins} label="Coins" />
                </div>
              </div>
              <div className="mt-4">
                <XpBar profile={profile} />
              </div>
              {!profile.playedToday && profile.streak > 0 && <p className="mt-3 text-xs text-live">Play any game today to keep your {profile.streak}-day streak alive.</p>}
            </>
          ) : null}
        </div>

        {/* Daily challenge */}
        <Link to="/games/daily" className="group relative overflow-hidden rounded-3xl bg-white/[.03] p-4 ring-1 ring-white/[.08] transition hover:ring-signal/40 sm:p-6">
          <div className="absolute inset-y-0 right-0 hidden w-[34%] opacity-60 [mask-image:linear-gradient(to_right,transparent,black_70%)] sm:block">
            <GameArt id="daily" className="size-full" />
          </div>
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-signal/10 blur-3xl" />
          <div className="relative flex items-center gap-2 text-signal">
            <CalendarCheck className="size-4" />
            <Eyebrow className="text-signal">Daily challenge</Eyebrow>
          </div>
          <p className="relative mt-2 font-display text-lg font-bold tracking-tight sm:mt-3 sm:pr-20 sm:text-xl">Four new challenges every day</p>
          <p className="relative mt-2 text-sm text-mist-500">
            {daily ? `${daily.quizDone ? "✓" : "○"} Quiz  ${daily.guessDone ? "✓" : "○"} Mystery player  ${daily.footleDone ? "✓" : "○"} Footle  ${daily.gridDone ? "✓" : "○"} Grid` : "Same for everyone. One try each."}
          </p>
        </Link>
      </div>

      {/* Create: tools for real-life games */}
      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:mt-8 sm:gap-3">
        {[
          { id: "tourney", to: "/games/tournaments", title: "Tournament creator", desc: "League, UCL or World Cup style, or a cup for your own games." },
          { id: "lineup", to: "/games/lineups", title: "Line-up creator", desc: "Formations, your players, drag to make your own shape." },
        ].map((c) => (
          <Link key={c.id} to={c.to} className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:ring-signal/40">
            <GameArt id={c.id} className="h-20 transition duration-500 group-hover:scale-[1.03] sm:h-28" />
            <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[9px] tracking-wider text-mist-100 uppercase backdrop-blur sm:top-3 sm:right-3 sm:text-[10px]">Create</span>
            <span className="flex flex-1 flex-col p-3 sm:p-5">
              <span className="font-display text-[15px] leading-tight font-bold tracking-tight sm:text-lg">{c.title}</span>
              <span className="mt-1 line-clamp-2 text-xs leading-snug text-mist-500 sm:text-sm">{c.desc}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Search */}
      <div className="mt-5 flex h-11 items-center gap-3 sm:mt-6 sm:h-12 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50">
        <Search className="size-[18px] shrink-0 text-mist-500" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search games" aria-label="Search games" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700" />
        {query && (
          <button onClick={() => setQuery("")} className="text-xs font-semibold text-mist-500 hover:text-mist-100">
            Clear
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="mt-6 rounded-2xl bg-white/[.03] px-4 py-8 text-center text-sm text-mist-500">No games match "{query}".</p>}

      {/* Games */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-3">
        {shown.map((g, i) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.35 }}>
            <Link to={g.to} className="group flex h-full flex-col overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:bg-white/[.04] hover:ring-signal/40">
              <div className="relative">
                <GameArt id={g.id} className="h-24 transition duration-500 group-hover:scale-[1.03] sm:h-36" />
                {g.tag && <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[9px] tracking-wider text-mist-100 uppercase backdrop-blur sm:top-3 sm:right-3 sm:px-2.5 sm:py-1 sm:text-[10px]">{g.tag}</span>}
              </div>
              <div className="flex flex-1 flex-col p-3 sm:p-5">
                <h3 className="font-display text-[15px] leading-tight font-bold tracking-tight sm:text-lg">{g.title}</h3>
                <p className={cn("mt-1 line-clamp-2 text-xs leading-snug text-mist-500 sm:mt-1.5 sm:line-clamp-none sm:text-sm sm:leading-relaxed")}>{g.desc}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      <p className="mt-10 text-[11px] leading-relaxed text-mist-700">
        Photos from{" "}
        <a href="https://unsplash.com/?utm_source=dixon_watch&utm_medium=referral" target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-mist-300">
          Unsplash
        </a>
        :{" "}
        {Object.values(PHOTO_CREDITS).map((c, i, all) => (
          <span key={c.page}>
            <a href={`${c.profile}?utm_source=dixon_watch&utm_medium=referral`} target="_blank" rel="noopener noreferrer" className="underline decoration-white/20 underline-offset-2 hover:text-mist-300">
              {c.photographer}
            </a>
            {i < all.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>

      {profile?.admin && (
        <div className="mt-6 flex flex-wrap gap-4">
          <Link to="/admin" className="inline-flex items-center gap-2 text-sm font-semibold text-signal">
            Admin dashboard →
          </Link>
          <Link to="/games/moderate" className="inline-flex items-center gap-2 text-sm font-semibold text-signal">
            Review submitted questions →
          </Link>
        </div>
      )}
    </div>
  );
}

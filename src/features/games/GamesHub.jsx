import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { Brain, CalendarCheck, Coins, Crown, Flame, Handshake, LayoutGrid, Medal, PenLine, Shirt, Swords, Target, Trophy, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { StatChip, useGames, XpBar } from "./GamesProvider";
import { ErrorNote, Eyebrow, PlayerChip } from "./ui";

export const GAMES = [
  { id: "predictor", to: "/games/predictor", title: "Match Predictor", desc: "Call the result before kickoff and compete with friends in a league.", icon: Target, tag: "Matchday" },
  { id: "quiz", to: "/games/quiz", title: "Football IQ Quiz", desc: "10 questions, 15 seconds each. Faster answers score more.", icon: Brain },
  { id: "battle", to: "/games/battle", title: "Head-to-Head", desc: "Beat a friend or a player of your level in the same quiz.", icon: Swords, tag: "Multiplayer" },
  { id: "guess", to: "/games/guess", title: "Guess the Player", desc: "Clues appear one by one. The fewer you need, the more you win.", icon: UserSearch },
  { id: "shirt", to: "/games/shirt", title: "Guess the Shirt Number", desc: "Which number does this player wear?", icon: Shirt },
  { id: "clubs", to: "/games/clubs", title: "Who Played for Both?", desc: "Two clubs. One player has worn both shirts.", icon: Handshake },
  { id: "trophy", to: "/games/trophy", title: "Name the Trophy", desc: "Work out the trophy from the clue.", icon: Trophy },
  { id: "xi", to: "/games/xi", title: "Complete the XI", desc: "A real recent line-up with three players missing.", icon: LayoutGrid },
  { id: "submit", to: "/games/submit", title: "Write a Question", desc: "Add your own. Approved questions earn you XP and coins.", icon: PenLine, tag: "Community" },
];

export function GamesHub() {
  const { loading, error, profile, daily } = useGames();

  return (
    <div>
      <PageHeader
        eyebrow="Games"
        title="Game Zone"
        description="Quizzes, predictions and battles. Earn XP, keep your streak, climb the weekly board."
        action={
          <div className="flex flex-wrap gap-2">
            <Link to="/games/leaderboard" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/[.06]">
              <Medal className="size-4 text-signal" /> Leaderboards
            </Link>
            <Link to="/games/profile" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/[.06]">
              <Crown className="size-4 text-signal" /> My profile
            </Link>
          </div>
        }
      />

      <ErrorNote>{error && `${error} The games server may be offline.`}</ErrorNote>

      {/* Player strip */}
      <div className="mt-8 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl bg-gradient-to-br from-signal/[.1] via-white/[.02] to-transparent p-5 ring-1 ring-signal/20 sm:p-6">
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
        <Link to="/games/daily" className="group relative overflow-hidden rounded-3xl bg-white/[.03] p-5 ring-1 ring-white/[.08] transition hover:ring-signal/40 sm:p-6">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-signal/10 blur-3xl" />
          <div className="relative flex items-center gap-2 text-signal">
            <CalendarCheck className="size-4" />
            <Eyebrow className="text-signal">Daily challenge</Eyebrow>
          </div>
          <p className="relative mt-3 font-display text-xl font-bold tracking-tight">A new quiz and mystery player every day</p>
          <p className="relative mt-2 text-sm text-mist-500">
            {daily ? `${daily.quizDone ? "✓" : "○"} Daily quiz   ${daily.guessDone ? "✓" : "○"} Mystery player` : "Same questions for everyone. One try each."}
          </p>
        </Link>
      </div>

      {/* Games */}
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g, i) => (
          <motion.div key={g.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, duration: 0.35 }}>
            <Link to={g.to} className="group flex h-full flex-col rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06] transition hover:-translate-y-0.5 hover:bg-white/[.04] hover:ring-signal/40">
              <div className="flex items-start justify-between">
                <span className="grid size-12 place-items-center rounded-2xl bg-signal/10 ring-1 ring-signal/25 transition group-hover:bg-signal/20">
                  <g.icon className="size-6 text-signal" />
                </span>
                {g.tag && <span className="rounded-full bg-white/[.06] px-2.5 py-1 font-mono text-[10px] tracking-wider text-mist-300 uppercase">{g.tag}</span>}
              </div>
              <h3 className="mt-5 font-display text-lg font-bold tracking-tight">{g.title}</h3>
              <p className={cn("mt-1.5 text-sm leading-relaxed text-mist-500")}>{g.desc}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      {profile?.admin && (
        <Link to="/games/moderate" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-signal">
          Review submitted questions →
        </Link>
      )}
    </div>
  );
}

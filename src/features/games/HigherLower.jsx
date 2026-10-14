import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, Flame, RotateCcw, Share2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { Crest, PlayerBadge } from "@/features/sports/Sheets";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, RewardCard, shareResult } from "./ui";

/*
 * Higher or Lower: is the second player or club's number higher or lower than the first?
 * One wrong answer ends the run; the pairs get closer the longer you last.
 */

function Subject({ item, value, label, hidden, tone }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center rounded-3xl p-3 text-center ring-1 transition sm:p-7", tone === "ok" ? "bg-signal/10 ring-signal/60" : tone === "bad" ? "bg-live/10 ring-live/60" : "bg-white/[.03] ring-white/[.08]")}>
      {item.type === "team" ? <Crest src={item.logo} name={item.name} className="size-14 sm:size-24" /> : <PlayerBadge name={item.name} team={item.sub} className="size-14 rounded-2xl text-lg sm:size-24 sm:rounded-[1.6rem] sm:text-2xl" />}
      <p className="mt-3 font-display text-base leading-tight font-bold break-words sm:mt-4 sm:text-2xl">{item.name}</p>
      <p className="mt-0.5 text-[11px] text-mist-500 sm:text-xs">{item.sub}</p>
      <div className="mt-3 min-h-[4rem] sm:mt-5 sm:min-h-[4.5rem]">
        {hidden ? (
          <span className="font-display text-5xl font-extrabold text-mist-700 sm:text-6xl">?</span>
        ) : (
          <motion.div key={value} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
            <span className="block font-display text-5xl leading-none font-extrabold tabular-nums sm:text-6xl">{value}</span>
          </motion.div>
        )}
        <span className="mt-1 block text-[11px] text-mist-500">{label}</span>
      </div>
    </div>
  );
}

export function HigherLower() {
  const { rewarded, profile } = useGames();
  const [phase, setPhase] = useState("intro"); // intro | loading | play | over
  const [round, setRound] = useState(null);
  const [reveal, setReveal] = useState(null); // { value, ok } while the answer is shown
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");

  async function start() {
    setError("");
    setPhase("loading");
    try {
      setRound(await gamesApi("hilo.start"));
      setReveal(null);
      setPhase("play");
    } catch (err) {
      setError(err.message);
      setPhase("intro");
    }
  }

  async function choose(choice) {
    if (busy || reveal) return;
    setBusy(true);
    setError("");
    try {
      const r = await gamesApi("hilo.answer", { session: round.session, choice });
      setReveal({ value: r.revealed, ok: r.correct });
      await new Promise((res) => setTimeout(res, r.correct ? 1000 : 1500));
      if (r.done) {
        setResult(r);
        setPhase("over");
        rewarded(r.reward);
      } else {
        setRound(r);
        setReveal(null);
      }
    } catch (err) {
      setError(err.message);
      setReveal(null);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `⬆️⬇️ I got a streak of ${result.streak} in Higher or Lower on Dixon Watch. Can you beat it?\n${window.location.origin}/games/hilo`;
    setShared(await shareResult(text));
  }

  const best = profile?.stats?.hiloBest ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>

      {(phase === "intro" || phase === "loading") && (
        <Card className="overflow-hidden text-center">
          <GameArt id="hilo" fit="meet" className="-mx-5 -mt-5 mb-6 h-56 sm:-mx-6 sm:-mt-6" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Higher or Lower</h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-mist-500">
            Two players or clubs, one number from this season. Is the second one higher or lower? One wrong answer ends your run, and the pairs get closer the longer you last.
          </p>
          {best > 0 && <p className="mt-4 text-sm text-mist-300">Your best streak: <span className="font-bold text-signal">{best}</span></p>}
          <div className="mt-7">
            <Button size="lg" onClick={start} loading={phase === "loading"}>
              Start
            </Button>
          </div>
          <Link to="/games/leaderboard?board=hiloWeekly" className="mt-5 inline-block text-sm font-semibold text-signal">
            See the best streaks →
          </Link>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      )}

      {phase === "play" && round && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-full bg-signal/10 px-3.5 py-1.5 font-mono text-sm font-bold text-signal ring-1 ring-signal/30">
              <Flame className="size-4" /> Streak {round.streak}
            </span>
            <span className="font-mono text-[11px] tracking-wider text-mist-500 uppercase">Best {Math.max(best, round.streak)}</span>
          </div>

          <p className="text-center text-[15px] text-mist-300">
            Does <b className="text-white">{round.next.name}</b> have <b className="text-signal">higher</b> or <b className="text-signal">lower</b> {round.metric.label} than <b className="text-white">{round.cur.name}</b>?
          </p>

          <AnimatePresence mode="wait">
            <motion.div key={round.cur.id + round.next.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }} className="flex gap-2 sm:gap-3">
              <Subject item={round.cur} value={round.cur.value} label={round.metric.label} />
              <Subject item={round.next} value={reveal?.value} label={round.metric.label} hidden={!reveal} tone={reveal ? (reveal.ok ? "ok" : "bad") : undefined} />
            </motion.div>
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" onClick={() => choose("higher")} disabled={busy || Boolean(reveal)}>
              <ArrowUp className="size-5" /> Higher
            </Button>
            <Button size="lg" variant="ghost" onClick={() => choose("lower")} disabled={busy || Boolean(reveal)}>
              <ArrowDown className="size-5" /> Lower
            </Button>
          </div>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {phase === "over" && result && (
        <div className="space-y-4">
          <Card className="text-center">
            <Eyebrow>{result.record && result.streak > 0 ? "New personal best!" : "Run over"}</Eyebrow>
            <p className="mt-3 font-display text-7xl font-extrabold text-signal tabular-nums">{result.streak}</p>
            <p className="text-sm text-mist-500">in a row</p>
            <p className="mx-auto mt-5 max-w-sm rounded-2xl bg-white/[.04] px-4 py-3 text-sm text-mist-300">
              {result.next.name} had <b className="text-white">{result.next.value}</b> {result.metric.label}, {result.cur.name} had <b className="text-white">{result.cur.value}</b>.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button onClick={start}>
                <RotateCcw className="size-4" /> Play again
              </Button>
              <Button variant="ghost" onClick={share}>
                <Share2 className="size-4" /> {shared === "copied" ? "Copied!" : "Share"}
              </Button>
              <Link to="/games/leaderboard?board=hiloWeekly">
                <Button variant="subtle">
                  <Trophy className="size-4" /> Leaderboard
                </Button>
              </Link>
            </div>
          </Card>
          <RewardCard reward={result.reward} />
        </div>
      )}
    </div>
  );
}

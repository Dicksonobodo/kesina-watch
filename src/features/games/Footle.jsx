import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarCheck, Flag, RotateCcw, Share2, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { PlayerBadge } from "@/features/sports/Sheets";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { NamePicker } from "./NamePicker";
import { Card, ErrorNote, Eyebrow, RewardCard, shareResult } from "./ui";

/*
 * Footle: guess the footballer in 8 tries. Each guess is a real player, and its six boxes show
 * how close it is: green is right, yellow is close, grey is wrong, arrows point to the answer.
 */

const TRIES = 8;
const EMOJI = { match: "🟩", near: "🟨", miss: "⬛" };

const tone = {
  match: "bg-emerald-500/85 text-white ring-emerald-300/50",
  near: "bg-amber-400/90 text-ink-950 ring-amber-200/50",
  miss: "bg-white/[.06] text-mist-300 ring-white/[.08]",
};

function Cell({ cell, delay }) {
  return (
    <motion.div
      initial={{ rotateX: 90, opacity: 0 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ delay, duration: 0.35 }}
      className={cn("flex min-h-[3.6rem] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-center ring-1", tone[cell.status])}
    >
      <span className="font-mono text-[8px] tracking-wider uppercase opacity-70">{cell.label}</span>
      <span className="flex items-center gap-0.5 text-[11px] leading-tight font-bold break-words">
        {cell.value}
        {cell.hint === "up" && <ArrowUp className="size-3 shrink-0" />}
        {cell.hint === "down" && <ArrowDown className="size-3 shrink-0" />}
      </span>
    </motion.div>
  );
}

export function Footle() {
  const { rewarded, daily: dailyState, refresh } = useGames();
  const [players, setPlayers] = useState(null);
  const [phase, setPhase] = useState("intro"); // intro | loading | play | done
  const [round, setRound] = useState(null); // { session, daily, guesses }
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [shared, setShared] = useState("");

  useEffect(() => {
    gamesApi("footle.players")
      .then((d) => setPlayers(d.players))
      .catch((e) => setError(e.message));
  }, []);

  const items = useMemo(() => (players ?? []).map((p) => ({ key: p.id, name: p.name, sub: p.team })), [players]);
  const tried = useMemo(() => new Set((round?.guesses ?? []).map((g) => g.id)), [round]);

  async function start(daily) {
    setError("");
    setPhase("loading");
    try {
      const r = await gamesApi("footle.start", { daily });
      setRound({ session: r.session, daily: r.daily, guesses: r.guesses ?? [] });
      setResult(null);
      setShared("");
      setPhase("play");
    } catch (err) {
      setError(err.message);
      setPhase("intro");
      refresh();
    }
  }

  function finish(r) {
    setResult(r);
    setPhase("done");
    rewarded(r.reward);
  }

  async function guess(item) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await gamesApi("footle.guess", { session: round.session, player: item.key });
      setRound((s) => ({ ...s, guesses: [...s.guesses, r.guess] }));
      if (r.done) setTimeout(() => finish(r), 1400);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    if (busy) return;
    setBusy(true);
    try {
      finish(await gamesApi("footle.giveup", { session: round.session }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const rows = round.guesses.map((g) => g.cells.map((c) => EMOJI[c.status]).join("")).join("\n");
    const head = `Footle ${round.daily ? new Date().toISOString().slice(0, 10) : "practice"} ${result.correct ? round.guesses.length : "X"}/${TRIES}`;
    setShared(await shareResult(`${head}\n${rows}\n${window.location.origin}/games/footle`));
  }

  const dailyDone = dailyState?.footleDone;
  const left = TRIES - (round?.guesses.length ?? 0);

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>

      {(phase === "intro" || phase === "loading") && (
        <Card className="overflow-hidden text-center">
          <GameArt id="footle" fit="meet" className="-mx-5 -mt-5 mb-6 h-56 sm:-mx-6 sm:-mt-6" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Footle</h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-mist-500">
            Guess the mystery footballer in 8 tries. Every guess shows how close you are: <b className="text-emerald-400">green</b> is right, <b className="text-amber-300">yellow</b> is close, grey is wrong. Arrows point to the answer for age and shirt number.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            {dailyDone ? (
              <p className="w-full rounded-2xl bg-white/[.04] px-4 py-3 text-sm text-mist-300">You scored {dailyState.footleScore} on today's Footle. A new one comes tomorrow!</p>
            ) : (
              <Button size="lg" onClick={() => start(true)} loading={phase === "loading"} disabled={!players}>
                <CalendarCheck className="size-4" /> Today's Footle
              </Button>
            )}
            <Button size="lg" variant="ghost" onClick={() => start(false)} disabled={!players || phase === "loading"}>
              <Shuffle className="size-4" /> Practice
            </Button>
          </div>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      )}

      {phase === "play" && round && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Eyebrow>{round.daily ? "Today's Footle" : "Practice"}</Eyebrow>
            <span className="rounded-full bg-signal/10 px-3 py-1 font-mono text-xs font-semibold text-signal ring-1 ring-signal/30">
              {left} {left === 1 ? "guess" : "guesses"} left
            </span>
          </div>

          <div className="space-y-3">
            {round.guesses.map((g, gi) => (
              <div key={g.id}>
                <p className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <PlayerBadge name={g.name} team="" photo={g.photo} className="size-6 rounded-lg text-[9px]" /> {g.name}
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {g.cells.map((c, i) => (
                    <Cell key={c.key} cell={c} delay={i * 0.12} />
                  ))}
                </div>
              </div>
            ))}
            {round.guesses.length === 0 && <p className="rounded-2xl bg-white/[.03] px-4 py-8 text-center text-sm text-mist-500">Pick any current player from the big five leagues to start. Try a well-known one.</p>}
          </div>

          <Card className="!p-4">
            <NamePicker items={items} exclude={tried} onPick={guess} busy={busy} placeholder="Search a player" />
            <div className="mt-3 flex justify-end">
              <Button variant="subtle" onClick={giveUp} disabled={busy}>
                <Flag className="size-4" /> Give up
              </Button>
            </div>
          </Card>
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {phase === "done" && result && (
        <div className="space-y-4">
          <Card className="text-center">
            <Eyebrow>{result.correct ? `Solved in ${result.tries}!` : "It was…"}</Eyebrow>
            <div className="mt-4 flex justify-center">
              <PlayerBadge name={result.answer.name} team={result.answer.team} photo={result.answer.photo} className="size-28 rounded-[2rem] text-3xl" />
            </div>
            <p className={cn("mt-4 font-display text-3xl font-extrabold tracking-tight", result.correct && "text-signal")}>{result.answer.name}</p>
            <p className="text-sm text-mist-500">
              {result.answer.team} · {result.answer.nationality} · {result.answer.position}
            </p>
            <p className="mt-5 font-display text-5xl font-extrabold text-signal tabular-nums">+{result.points}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button onClick={share}>
                <Share2 className="size-4" /> {shared === "copied" ? "Copied!" : "Share result"}
              </Button>
              <Button variant="ghost" onClick={() => start(false)}>
                <RotateCcw className="size-4" /> Practice another
              </Button>
              <Link to="/games/daily">
                <Button variant="subtle">Daily challenge</Button>
              </Link>
            </div>
          </Card>
          <RewardCard reward={result.reward} />
        </div>
      )}
    </div>
  );
}

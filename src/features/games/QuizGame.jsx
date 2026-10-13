import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Brain, CalendarCheck, Flag, Handshake, LayoutGrid, RotateCcw, Share2, Shirt, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { PlayerBadge } from "@/features/sports/Sheets";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, OptionButton, RewardCard, TimeBar } from "./ui";

/*
 * The runner for every "series of questions" game. The server keeps the answers and the clock:
 * a question arrives without its answer, and answering returns the result plus the next question.
 */

export const QUIZ_INFO = {
  quiz: { title: "Football IQ Quiz", icon: Brain, blurb: "10 questions on football history, clubs, players and trophies. 15 seconds each, and faster answers score more.", levels: true },
  daily: { title: "Daily quiz", icon: CalendarCheck, blurb: "The same 10 questions for everyone today. One try, so make it count. Your score goes on today's board." },
  shirt: { title: "Guess the shirt number", icon: Shirt, blurb: "A current star from the big five leagues. Which number is on his back?" },
  clubs: { title: "Who played for both?", icon: Handshake, blurb: "Two clubs, four players. Only one has worn both shirts." },
  trophy: { title: "Name the trophy", icon: Trophy, blurb: "Read the clue and name the trophy or award." },
  xi: { title: "Complete the XI", icon: LayoutGrid, blurb: "A real line-up from the last few days, with three players missing. Name them." },
};

const LEVELS = [
  ["easy", "Easy", "Warm-up questions"],
  ["mixed", "Mixed", "A bit of everything"],
  ["medium", "Medium", "For regular fans"],
  ["hard", "Hard", "Only for experts"],
];

const SOURCE_NOTE = {
  opentdb: "Question from Open Trivia DB (CC BY-SA 4.0)",
  wikidata: "Player data from Wikidata (CC0)",
  generated: "Made from live league data",
  espn: "Data from ESPN",
};

const storeKey = (kind) => `dw:game:${kind}`;
const remember = (kind, id) => {
  try {
    if (id) sessionStorage.setItem(storeKey(kind), id);
    else sessionStorage.removeItem(storeKey(kind));
  } catch {
    /* private mode */
  }
};
const recall = (kind) => {
  try {
    return sessionStorage.getItem(storeKey(kind));
  } catch {
    return null;
  }
};

export function QuizGame({ kind }) {
  const info = QUIZ_INFO[kind];
  const navigate = useNavigate();
  const { rewarded, daily, refresh } = useGames();
  const [phase, setPhase] = useState("intro"); // intro | loading | playing | reveal | done
  const [difficulty, setDifficulty] = useState("mixed");
  const [session, setSession] = useState(null);
  const [q, setQ] = useState(null);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [shownAt, setShownAt] = useState(0);
  const [filled, setFilled] = useState({});
  const [reported, setReported] = useState(false);
  const locked = useRef(false);

  // Pick up a game that was in progress (page refresh).
  useEffect(() => {
    const id = recall(kind);
    if (!id) return;
    gamesApi("quiz.current", { session: id })
      .then((r) => {
        if (r.done || !r.question) return remember(kind, null);
        setSession(id);
        setQ(r.question);
        setScore(r.score ?? 0);
        setShownAt(Date.now());
        setPhase("playing");
      })
      .catch(() => remember(kind, null));
  }, [kind]);

  async function start() {
    setError("");
    setPhase("loading");
    try {
      const r = await gamesApi("quiz.start", { kind, difficulty });
      remember(kind, r.session);
      setSession(r.session);
      setQ(r.question);
      setScore(0);
      setPicked(null);
      setFeedback(null);
      setFilled({});
      setSummary(null);
      setReported(false);
      locked.current = false;
      setShownAt(Date.now());
      setPhase("playing");
    } catch (err) {
      setError(err.message);
      setPhase("intro");
      refresh();
    }
  }

  const submit = useCallback(
    async (choice) => {
      if (locked.current || !q) return;
      locked.current = true;
      setPicked(choice);
      try {
        const r = await gamesApi("quiz.answer", { session, index: q.index, choice });
        setFeedback({ correct: r.correct, answer: r.answer, points: r.points, timedOut: r.timedOut });
        setScore(r.score);
        if (q.meta?.kind === "xi") setFilled((f) => ({ ...f, [q.meta.slot]: q.options[r.answer] }));
        setPhase("reveal");
        setTimeout(() => {
          if (r.next) {
            setQ(r.next);
            setPicked(null);
            setFeedback(null);
            setReported(false);
            locked.current = false;
            setShownAt(Date.now());
            setPhase("playing");
          } else {
            remember(kind, null);
            setSummary(r.done);
            setPhase("done");
            rewarded(r.done?.reward);
          }
        }, 1500);
      } catch (err) {
        setError(err.message);
        locked.current = false;
        setPicked(null);
      }
    },
    [q, session, kind, rewarded],
  );

  // Time's up: answer with nothing.
  useEffect(() => {
    if (phase !== "playing" || !q) return undefined;
    const t = setTimeout(() => submit(-1), q.seconds * 1000 + 400);
    return () => clearTimeout(t);
  }, [phase, q, submit]);

  async function report() {
    setReported(true);
    gamesApi("quiz.report", { qid: q.id }).catch(() => {});
  }

  const dailyDone = kind === "daily" && daily?.quizDone;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>

      {phase === "intro" || phase === "loading" ? (
        <Card className="overflow-hidden text-center">
          <GameArt id={kind === "daily" ? "daily" : kind} fit="meet" className="-mx-5 -mt-5 mb-6 h-40 sm:-mx-6 sm:-mt-6" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{info.title}</h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-mist-500">{info.blurb}</p>

          {info.levels && (
            <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-2 sm:grid-cols-4">
              {LEVELS.map(([id, label, hint]) => (
                <button key={id} onClick={() => setDifficulty(id)} title={hint} className={cn("rounded-2xl px-3 py-3 text-sm font-semibold ring-1 transition", difficulty === id ? "bg-signal/10 text-signal ring-signal/60" : "bg-white/[.03] text-mist-300 ring-white/[.08] hover:bg-white/[.06]")}>
                  {label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-7">
            {dailyDone ? (
              <p className="rounded-2xl bg-white/[.04] px-4 py-3 text-sm text-mist-300">You scored {daily.quizScore} today. Come back tomorrow for a fresh quiz!</p>
            ) : (
              <Button size="lg" onClick={start} loading={phase === "loading"} className="w-full sm:w-auto">
                Start
              </Button>
            )}
          </div>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      ) : null}

      {(phase === "playing" || phase === "reveal") && q && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>
              {info.title} · {q.index + 1} / {q.total}
            </Eyebrow>
            <span className="font-display text-lg font-bold tabular-nums">{score} pts</span>
          </div>
          <TimeBar seconds={q.seconds} startedAt={shownAt} paused={phase === "reveal"} />

          <AnimatePresence mode="wait">
            <motion.div key={q.id + q.index} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="mt-5">
              <Card>
                {q.meta?.kind === "xi" && <LineupPitch xi={q.meta.xi} current={q.meta.slot} filled={filled} />}
                {q.meta?.kind === "player" && (
                  <div className="mb-4 flex items-center gap-4">
                    <PlayerBadge name={q.meta.name} team={q.meta.team} className="size-20 rounded-3xl text-2xl" />
                    <div>
                      <p className="font-display text-xl font-bold">{q.meta.name}</p>
                      <p className="text-sm text-mist-500">{q.meta.team}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/[.06] px-2.5 py-1 font-mono text-[10px] tracking-wider text-mist-300 uppercase">{q.category.replace(/-/g, " ")}</span>
                  <span className={cn("rounded-full px-2.5 py-1 font-mono text-[10px] tracking-wider uppercase", q.difficulty === "hard" ? "bg-live/10 text-live" : q.difficulty === "easy" ? "bg-signal/10 text-signal" : "bg-white/[.06] text-mist-300")}>{q.difficulty}</span>
                </div>
                <h2 className="mt-4 font-display text-[clamp(20px,3.4vw,26px)] leading-snug font-bold tracking-tight text-balance">{q.text}</h2>
                <div className="mt-5 grid gap-2.5">
                  {q.options.map((opt, i) => {
                    let state = "idle";
                    if (feedback) state = i === feedback.answer ? "correct" : i === picked ? "wrong" : "dim";
                    else if (picked === i) state = "picked";
                    return <OptionButton key={i} index={i} label={opt} state={state} disabled={Boolean(feedback) || picked !== null} onClick={() => submit(i)} />;
                  })}
                </div>

                <div className="mt-4 flex min-h-6 items-center justify-between gap-3 text-xs text-mist-500">
                  <span>{q.by ? `Question by ${q.by}` : SOURCE_NOTE[q.source] ?? ""}</span>
                  {(q.source === "community" || q.source === "opentdb") && !reported && (
                    <button onClick={report} className="inline-flex items-center gap-1 text-mist-500 transition hover:text-live">
                      <Flag className="size-3" /> Report
                    </button>
                  )}
                  {reported && <span>Thanks, we'll check it.</span>}
                </div>
              </Card>

              <AnimatePresence>
                {feedback && (
                  <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-4 text-center font-display text-xl font-bold", feedback.correct ? "text-signal" : "text-live")}>
                    {feedback.correct ? `Correct! +${feedback.points}` : feedback.timedOut && picked === -1 ? "Time's up!" : "Not quite"}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </div>
      )}

      {phase === "done" && summary && <Results summary={summary} info={info} kind={kind} onAgain={() => setPhase("intro")} onBack={() => navigate("/games")} />}
    </div>
  );
}

function Results({ summary, info, kind, onAgain, onBack }) {
  const pct = Math.round((summary.correct / summary.total) * 100);
  const share = async () => {
    const text = `I scored ${summary.score} points (${summary.correct}/${summary.total}) in ${info.title} on Dixon Watch. Can you beat me?`;
    try {
      if (navigator.share) await navigator.share({ title: "Dixon Watch", text, url: `${location.origin}/games` });
      else await navigator.clipboard.writeText(`${text} ${location.origin}/games`);
    } catch {
      /* cancelled */
    }
  };
  return (
    <div className="space-y-4">
      <Card className="text-center">
        <Eyebrow>{info.title}</Eyebrow>
        <p className="mt-3 font-display text-6xl font-extrabold tracking-tight text-signal tabular-nums">{summary.score}</p>
        <p className="mt-1 text-sm text-mist-500">
          {summary.correct} of {summary.total} correct · {pct}%
          {summary.perfect && " · Perfect!"}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {kind !== "daily" && (
            <Button onClick={onAgain}>
              <RotateCcw className="size-4" /> Play again
            </Button>
          )}
          <Button variant="ghost" onClick={share}>
            <Share2 className="size-4" /> Share
          </Button>
          <Button variant="ghost" onClick={onBack}>
            All games
          </Button>
        </div>
      </Card>
      <RewardCard reward={summary.reward} />
      <Card>
        <Eyebrow className="mb-3">Review</Eyebrow>
        <ul className="divide-y divide-white/[.05]">
          {summary.results.map((r, i) => (
            <li key={i} className="py-3">
              <p className="text-sm font-medium">{r.text}</p>
              <p className="mt-1 text-xs">
                <span className={r.ok ? "text-signal" : "text-live"}>{r.ok ? "✓" : "✗"} </span>
                <span className="text-mist-300">{r.options[r.answer]}</span>
                {!r.ok && r.choice >= 0 && <span className="text-mist-500"> · you said {r.options[r.choice]}</span>}
                {r.points > 0 && <span className="font-mono text-mist-500"> · +{r.points}</span>}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** The line-up with the missing players as "?" (the one being asked about pulses). */
function LineupPitch({ xi, current, filled }) {
  const rows = [...new Set(xi.players.map((p) => p.row))].sort((a, b) => b - a);
  return (
    <div className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-900/40 to-emerald-950/60 p-3 ring-1 ring-white/10">
      <p className="mb-2 text-center text-[11px] text-mist-300">
        {xi.team} vs {xi.opponent}
        {xi.formation ? ` · ${xi.formation}` : ""}
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row} className="flex justify-around gap-1">
            {xi.players
              .filter((p) => p.row === row)
              .map((p, i) => {
                const hidden = p.slot >= 0 && p.name === null;
                const name = hidden ? filled[p.slot] ?? "?" : p.name;
                const active = hidden && p.slot === current;
                return (
                  <div key={i} className="flex w-16 flex-col items-center text-center sm:w-20">
                    <span className={cn("grid size-8 place-items-center rounded-full font-mono text-[11px] font-bold ring-1", active ? "animate-pulse bg-signal text-ink-950 ring-signal" : hidden && !filled[p.slot] ? "bg-white/10 text-mist-300 ring-white/20" : "bg-white/15 text-white ring-white/20")}>{hidden && !filled[p.slot] ? "?" : p.number || ""}</span>
                    <span className={cn("mt-1 w-full truncate text-[10px] leading-tight", active ? "font-bold text-signal" : "text-white/90")}>{name}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Eye, Flag, RotateCcw, Search, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { PlayerBadge } from "@/features/sports/Sheets";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { plain } from "./NamePicker";
import { Card, ErrorNote, Eyebrow, RewardCard } from "./ui";

/*
 * Guess the player: clues appear one at a time (the server reveals them, so the answer never
 * reaches the browser early). The fewer clues you need, the more points you get.
 */

const MODES = {
  players: {
    art: "guess",
    title: (daily) => (daily ? "Mystery player of the day" : "Guess the player"),
    intro: "A current star from the big five leagues. You start with one clue; every wrong guess reveals another. Win 100 points with one clue, down to 10 with the last.",
    again: "Another player",
  },
  career: {
    art: "career",
    title: () => "Career path",
    intro: "Here is a footballer's whole career, club by club with the year he joined. Who is he? Every wrong guess gives you a hint (his country, position, birth year, then letters). Win 100 points with the path alone, down to 10 with the last hint.",
    again: "Another career",
  },
};

export function GuessPlayer({ daily = false, mode = "players" }) {
  const copy = MODES[mode];
  const [names, setNames] = useState(null); // career mode suggests from our own list
  const { rewarded, daily: dailyState, refresh } = useGames();
  const [phase, setPhase] = useState("intro"); // intro | loading | playing | done
  const [round, setRound] = useState(null); // { session, total, points, clues }
  const [result, setResult] = useState(null);
  const [text, setText] = useState("");
  const [suggest, setSuggest] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);

  useEffect(() => {
    if (mode === "career") gamesApi("career.names").then((d) => setNames(d.names)).catch(() => {});
  }, [mode]);

  // Name suggestions from the search feed (any football player; the answer isn't leaked by it).
  useEffect(() => {
    const q = text.trim();
    if (mode === "career") {
      const words = plain(q).split(" ").filter(Boolean);
      if (plain(q).length < 2 || phase !== "playing" || !names) return setSuggest([]);
      const hits = names.filter((n) => words.every((w) => plain(n).includes(w))).slice(0, 5);
      return setSuggest(hits.map((name) => ({ id: name, league: "c", name, subtitle: "" })));
    }
    if (q.length < 3 || phase !== "playing") return setSuggest([]);
    const controller = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/sports/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((b) => setSuggest((b.players ?? []).filter((p) => p.sport === "football").slice(0, 5)))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [text, phase, mode, names]);

  async function start() {
    setError("");
    setPhase("loading");
    try {
      const r = await gamesApi("guess.start", { daily, mode });
      setRound({ session: r.session, total: r.total, points: r.points, clues: r.clues });
      setResult(null);
      setText("");
      setNote("");
      setPhase("playing");
    } catch (err) {
      setError(err.message);
      setPhase("intro");
      refresh();
    }
  }

  function apply(r) {
    if (r.done) {
      setResult(r);
      setPhase("done");
      rewarded(r.reward);
    } else if (r.clue) {
      setRound((s) => ({ ...s, clues: [...s.clues, r.clue] }));
    }
  }

  async function guess(name) {
    const value = (name ?? text).trim();
    if (value.length < 2 || busy) return;
    setBusy(true);
    setNote("");
    try {
      const r = await gamesApi("guess.answer", { session: round.session, name: value });
      if (!r.done) setNote(`Not ${value}. Here's another clue.`);
      setText("");
      setSuggest([]);
      apply(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function nextClue() {
    setBusy(true);
    try {
      apply(await gamesApi("guess.reveal", { session: round.session }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    setBusy(true);
    try {
      apply(await gamesApi("guess.giveup", { session: round.session }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const done = daily && dailyState?.guessDone;
  const used = round?.clues.length ?? 0;
  const worth = round?.points?.[used - 1];

  return (
    <div className="mx-auto max-w-2xl">
      <Link to={daily ? "/games/daily" : "/games"} className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> {daily ? "Daily challenge" : "Games"}
      </Link>

      {(phase === "intro" || phase === "loading") && (
        <Card className="overflow-hidden text-center">
          <GameArt id={copy.art} fit="meet" className="-mx-5 -mt-5 mb-6 h-56 sm:-mx-6 sm:-mt-6" />
          <h1 className="font-display text-3xl font-extrabold tracking-tight">{copy.title(daily)}</h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-mist-500">
            {copy.intro}
            {daily && " Same player for everyone today, one try."}
          </p>
          <div className="mt-7">
            {done ? (
              <p className="rounded-2xl bg-white/[.04] px-4 py-3 text-sm text-mist-300">You scored {dailyState.guessScore} on today's player. Back tomorrow!</p>
            ) : (
              <Button size="lg" onClick={start} loading={phase === "loading"}>
                Start
              </Button>
            )}
          </div>
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      )}

      {phase === "playing" && round && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Eyebrow>
              Clue {used} of {round.total}
            </Eyebrow>
            <span className="rounded-full bg-signal/10 px-3 py-1 font-mono text-xs font-semibold text-signal ring-1 ring-signal/30">Worth {worth} pts</span>
          </div>

          <div className="space-y-2.5">
            {round.clues.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4 rounded-2xl bg-white/[.04] px-4 py-3.5 ring-1 ring-white/[.08]">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-signal/15 font-mono text-xs font-bold text-signal">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">{c.label}</span>
                  {c.path ? (
                    <ol className="mt-3 space-y-0">
                      {c.path.map((s, k) => (
                        <li key={k} className="relative flex items-center gap-3 pb-3 last:pb-0">
                          {k < c.path.length - 1 && <span className="absolute top-5 left-[7px] h-full w-px bg-signal/30" />}
                          <span className="relative size-[15px] shrink-0 rounded-full bg-signal ring-4 ring-signal/20" />
                          <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{s.c}</span>
                          <span className="font-mono text-xs text-mist-500">{s.y}</span>
                        </li>
                      ))}
                    </ol>
                  ) : c.photo ? (
                    <img src={c.photo} alt="The mystery player" referrerPolicy="no-referrer" className="mt-2 h-40 rounded-2xl bg-white/[.04] object-contain" />
                  ) : (
                    <span className="mt-0.5 block text-[17px] font-semibold">{c.text}</span>
                  )}
                </span>
              </motion.div>
            ))}
          </div>

          {note && <p className="text-center text-sm text-live">{note}</p>}

          <Card className="!p-4">
            <div className="relative">
              <div className="flex h-12 items-center gap-3 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50">
                <Search className="size-[18px] shrink-0 text-mist-500" />
                <input
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && guess()}
                  placeholder="Type the player's name"
                  aria-label="Your guess"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700"
                />
                {busy && <Spinner className="size-4 text-mist-500" />}
              </div>
              {suggest.length > 0 && (
                <ul className="absolute inset-x-0 top-14 z-10 overflow-hidden rounded-2xl bg-ink-900 p-1.5 shadow-2xl ring-1 shadow-black/60 ring-white/10">
                  {suggest.map((p) => (
                    <li key={`${p.league}-${p.id}`}>
                      <button onClick={() => guess(p.name)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/[.07]">
                        <PlayerBadge name={p.name} team={p.subtitle} className="size-8 rounded-lg text-[10px]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-[11px] text-mist-500">{p.subtitle}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => guess()} disabled={text.trim().length < 2} loading={busy}>
                Guess
              </Button>
              <Button variant="ghost" onClick={nextClue} disabled={busy || used >= round.total}>
                <Eye className="size-4" /> Next clue
              </Button>
              <Button variant="subtle" onClick={giveUp} disabled={busy} className="ml-auto">
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
            <Eyebrow>{result.correct ? "You got it!" : "It was…"}</Eyebrow>
            <div className="mt-4 flex justify-center">
              <PlayerBadge name={result.answer.name} team={result.answer.team} photo={result.answer.photo} className="size-28 rounded-[2rem] text-3xl" />
            </div>
            <p className={cn("mt-4 font-display text-3xl font-extrabold tracking-tight", result.correct ? "text-signal" : "")}>{result.answer.name}</p>
            <p className="text-sm text-mist-500">
              {[result.answer.team, result.answer.nationality, result.answer.position].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-5 font-display text-5xl font-extrabold text-signal tabular-nums">+{result.points}</p>
            <p className="text-xs text-mist-500">
              {result.correct ? `with ${result.cluesUsed} clue${result.cluesUsed === 1 ? "" : "s"}` : "No points this time"}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {!daily && (
                <Button onClick={() => setPhase("intro")}>
                  <RotateCcw className="size-4" /> {copy.again}
                </Button>
              )}
              <Link to={daily ? "/games/daily" : "/games"}>
                <Button variant="ghost">{daily ? "Back to daily" : "All games"}</Button>
              </Link>
            </div>
          </Card>
          <RewardCard reward={result.reward} />
        </div>
      )}
    </div>
  );
}

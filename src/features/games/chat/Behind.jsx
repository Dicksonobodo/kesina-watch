import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, HelpCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { PlayerBadge } from "@/features/sports/Sheets";
import { NamePicker } from "../NamePicker";
import { Banner } from "./GameHost";
import { saveSeen, seenCount } from "./RoundDone";

/*
 * Who's Behind You? One person plays at a time: the picker chooses a footballer, the guesser asks
 * yes/no questions and then sends their answer, and the picker approves it. Then they swap.
 * The screen always says, in one line, what you have to do right now.
 */

let playersCache = null;
function usePlayers() {
  const [list, setList] = useState(playersCache);
  useEffect(() => {
    if (playersCache) return;
    gamesApi("behind.players")
      .then((r) => {
        playersCache = r.players;
        setList(r.players);
      })
      .catch(() => setList([]));
  }, []);
  return list;
}

function Mystery({ className }) {
  return (
    <span className={cn("grid place-items-center rounded-[1.6rem] bg-gradient-to-b from-slate-700 to-slate-900 ring-2 ring-white/20", className)}>
      <span className="font-display text-5xl font-extrabold text-white/80">?</span>
    </span>
  );
}

function Panel({ children, glow }) {
  return <div className={cn("rounded-3xl bg-black/35 p-4 ring-1 backdrop-blur", glow ? "ring-signal/50" : "ring-white/10")}>{children}</div>;
}

function Waiting({ text }) {
  return (
    <p className="flex items-center justify-center gap-2 py-2 text-center text-sm text-white/70">
      <span className="size-2 animate-pulse rounded-full bg-signal" /> {text}
    </p>
  );
}

const answerTone = { Yes: "bg-emerald-500 text-white", No: "bg-live text-white", "Not sure": "bg-white/20 text-white" };

export default function Behind({ game, move, busy, error }) {
  const players = usePlayers();
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const name = (uid) => (uid === me ? "You" : opp.name);
  const myTurn = game.status === "playing" && game.turn === me;
  const picker = game.role === "picker";
  const [questions, setQuestions] = useState(10);
  const [rounds, setRounds] = useState(3);
  const [picked, setPicked] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [reveal, setReveal] = useState(null);
  // Turns already shown on this device; a turn that ended while you were away is shown when you come back.
  const seenKey = `dw-behind-seen-${game.id}`;
  const seenTurns = useRef(seenCount(seenKey, Math.max(0, game.turns.length - 1)));
  const logEnd = useRef(null);

  const items = useMemo(() => (players ?? []).map((p) => ({ key: p.id, name: p.name, sub: p.team })), [players]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [game.log.length]);

  // a turn just finished: show who it was
  useEffect(() => {
    if (game.turns.length > seenTurns.current) setReveal({ ...game.turns.at(-1), n: game.turns.length });
    seenTurns.current = game.turns.length;
    saveSeen(seenKey, game.turns.length);
  }, [game.turns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (body) => {
    try {
      return await move(body);
    } catch {
      return null;
    }
  };

  const myScore = game.score[me] ?? 0;
  const theirScore = game.score[opp.uid] ?? 0;
  const guesserName = game.guesser === me ? "you" : opp.name;

  /* ---------- the one thing to do right now ---------- */
  let headline = "";
  if (game.status === "done") headline = "Game over";
  else if (game.phase === "setup") headline = myTurn ? "Set up the game" : `${opp.name} is setting up the game`;
  else if (game.phase === "pick") headline = myTurn ? `Pick a footballer for ${opp.name} to guess` : `${opp.name} is picking a footballer for you`;
  else if (game.phase === "ask") headline = myTurn ? "Ask a question, or send your answer" : `${opp.name} is guessing your player`;
  else if (game.phase === "answer") headline = myTurn ? `Answer ${opp.name}'s question` : `Waiting for ${opp.name} to answer`;
  else if (game.phase === "judge") headline = myTurn ? `Is ${opp.name} right?` : `${opp.name} is checking your answer`;

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-3">
      <Banner game={game} />

      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/30 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-white/80 uppercase ring-1 ring-white/10">
          {game.phase === "setup" ? "New game" : `Round ${Math.min(game.round, game.rounds)} of ${game.rounds}`}
        </span>
        <span className="font-display text-lg font-extrabold tabular-nums">
          You {myScore} <span className="text-white/40">–</span> {theirScore} {opp.name}
        </span>
      </div>

      {/* what to do now */}
      <motion.p key={headline} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("mt-4 text-center font-display text-[22px] leading-tight font-extrabold", myTurn ? "text-signal" : "text-white/80")}>
        {headline}
      </motion.p>
      {game.status === "playing" && game.phase !== "setup" && game.phase !== "pick" && (
        <p className="mt-1 text-center text-xs text-white/60">{picker ? `${opp.name} is guessing the player you picked` : "You're guessing. Only your friend can see the player."}</p>
      )}

      {/* the player card: the picker sees it, the guesser sees a ? */}
      {game.status === "playing" && game.phase !== "setup" && game.phase !== "pick" && (
        <div className="mt-3 flex items-center gap-3 rounded-3xl bg-black/30 p-3 ring-1 ring-white/10">
          {picker && game.card ? <PlayerBadge name={game.card.name} team={game.card.team} photo={game.card.photo} className="size-16 rounded-2xl text-lg" /> : <Mystery className="size-16 [&>span]:text-3xl" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-white/60">{picker ? "The player you picked" : `The player ${opp.name} picked for you`}</span>
            <span className="block truncate font-display text-lg font-bold">{picker && game.card ? game.card.name : "Who is it?"}</span>
            <span className="block text-[11px] text-white/60">{game.questionsLeft} of {game.questions} questions left for {guesserName}</span>
          </span>
        </div>
      )}

      {/* ----- setup ----- */}
      {game.status === "playing" && game.phase === "setup" && (
        <div className="mt-4">
          {myTurn ? (
            <Panel glow>
              <p className="text-sm font-semibold">How many questions for each guess?</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {game.choices.questions.map((q) => (
                  <button key={q} onClick={() => setQuestions(q)} className={cn("h-11 rounded-2xl font-display text-lg font-bold ring-1 transition", questions === q ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.06] ring-white/10")}>
                    {q}
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold">How many rounds?</p>
              <p className="text-[11px] text-white/60">In each round you both get one turn to guess.</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {game.choices.rounds.map((r) => (
                  <button key={r} onClick={() => setRounds(r)} className={cn("h-11 rounded-2xl font-display text-lg font-bold ring-1 transition", rounds === r ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.06] ring-white/10")}>
                    {r}
                  </button>
                ))}
              </div>
              <Button className="mt-4 w-full" size="lg" onClick={() => act({ do: "setup", questions, rounds })} loading={busy}>
                Start · you pick first
              </Button>
            </Panel>
          ) : (
            <Waiting text={`Waiting for ${opp.name}`} />
          )}
        </div>
      )}

      {/* ----- pick ----- */}
      {game.status === "playing" && game.phase === "pick" && (
        <div className="mt-4">
          {myTurn ? (
            <Panel glow>
              <p className="text-xs text-white/60">{opp.name} won't see who it is. You will, so you can answer their questions.</p>
              <div className="mt-3">{players ? <NamePicker items={items} onPick={setPicked} placeholder="Search any footballer" autoFocus={false} /> : <div className="skeleton h-12 rounded-full" />}</div>
              {picked && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[.06] p-3">
                  <PlayerBadge name={picked.name} team={picked.sub} className="size-12 rounded-xl text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{picked.name}</span>
                    <span className="block truncate text-xs text-white/60">{picked.sub}</span>
                  </span>
                  <Button size="sm" onClick={async () => (await act({ do: "pick", player: picked.key })) && setPicked(null)} loading={busy}>
                    Send
                  </Button>
                </div>
              )}
            </Panel>
          ) : (
            <Panel>
              <div className="flex flex-col items-center py-2">
                <Mystery className="size-20" />
                <Waiting text={`${opp.name} is picking your player`} />
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* ----- the questions and answers so far ----- */}
      {game.status === "playing" && game.log.length > 0 && (
        <div className="mt-3 max-h-60 space-y-2 overflow-y-auto rounded-3xl bg-black/25 p-3 ring-1 ring-white/10">
          {game.log.map((x) => {
            const mine = game.guesser === me; // the list is the guesser's questions and answers; the picker's replies sit under each
            return (
              <div key={x.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {x.type === "q" ? (
                  <>
                    <span className={cn("max-w-[85%] rounded-[18px] px-3 py-1.5 text-[14px]", mine ? "bg-signal text-ink-950" : "bg-white/[.12]")}>{x.text}</span>
                    {x.answer ? <span className={cn("mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", answerTone[x.answer])}>{x.answer}</span> : <span className="mt-1 text-[11px] text-white/50">waiting for an answer…</span>}
                  </>
                ) : (
                  <span className={cn("rounded-2xl px-3 py-1.5 text-[13px] font-semibold", x.verdict === "correct" ? "bg-emerald-500 text-white" : x.verdict === "wrong" ? "bg-live/25 text-live" : "bg-amber-400/20 text-amber-200")}>
                    {guesserName === "you" ? "Your answer" : `${opp.name}'s answer`}: {x.text} {x.verdict === "correct" ? "✓" : x.verdict === "wrong" ? "✗" : "· checking…"}
                  </span>
                )}
              </div>
            );
          })}
          <span ref={logEnd} />
        </div>
      )}

      {/* ----- the guesser asks or answers ----- */}
      {game.status === "playing" && game.phase === "ask" && myTurn && (
        <div className="mt-3 space-y-3">
          <Panel glow>
            <p className="text-sm font-semibold">Ask a yes/no question</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if ((await act({ do: "ask", text: question.trim() })) !== null) setQuestion("");
              }}
              className="mt-2 flex gap-2"
            >
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} disabled={game.questionsLeft <= 0} placeholder={game.questionsLeft > 0 ? "e.g. Do I play in England?" : "No questions left"} className="h-11 min-w-0 flex-1 rounded-full bg-white/[.08] px-4 text-[15px] ring-1 ring-white/15 outline-none placeholder:text-white/40 focus:ring-signal/60" />
              <button type="submit" disabled={busy || question.trim().length < 3 || game.questionsLeft <= 0} aria-label="Ask" className="grid size-11 shrink-0 place-items-center rounded-full bg-signal text-ink-950 disabled:bg-white/10 disabled:text-white/40">
                <Send className="size-[18px]" />
              </button>
            </form>
            <p className="mt-2 flex items-center gap-1 text-xs text-white/60">
              <HelpCircle className="size-3.5" /> {game.questionsLeft} question{game.questionsLeft === 1 ? "" : "s"} left
            </p>
          </Panel>
          <Panel>
            <p className="text-sm font-semibold">Think you know? Send your answer</p>
            <p className="text-[11px] text-white/60">{opp.name} will say if it's right. A wrong answer uses up a question.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if ((await act({ do: "guess", text: answer.trim() })) !== null) setAnswer("");
              }}
              className="mt-2 flex gap-2"
            >
              <input value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={60} placeholder="Type the player's name" className="h-11 min-w-0 flex-1 rounded-full bg-white/[.08] px-4 text-[15px] ring-1 ring-white/15 outline-none placeholder:text-white/40 focus:ring-signal/60" />
              <Button type="submit" disabled={busy || answer.trim().length < 2}>
                Send
              </Button>
            </form>
            <button onClick={() => act({ do: "giveup" })} className="mt-2 text-xs font-semibold text-white/50 hover:text-white">
              Give up this turn
            </button>
          </Panel>
        </div>
      )}

      {/* ----- the picker answers a question ----- */}
      {game.status === "playing" && game.phase === "answer" && myTurn && game.pending && (
        <div className="mt-3">
          <Panel glow>
            <p className="text-xs text-white/60">{opp.name} asks about {game.card?.name}:</p>
            <p className="mt-1 font-display text-xl font-bold">“{game.pending.text}”</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[["yes", "Yes", "bg-emerald-500"], ["no", "No", "bg-live"], ["maybe", "Not sure", "bg-white/15"]].map(([v, label, c]) => (
                <button key={v} disabled={busy} onClick={() => act({ do: "answer", answer: v })} className={cn("h-12 rounded-2xl font-bold text-white transition active:scale-95 disabled:opacity-50", c)}>
                  {label}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      )}

      {/* ----- the picker approves the answer ----- */}
      {game.status === "playing" && game.phase === "judge" && myTurn && game.pending && (
        <div className="mt-3">
          <Panel glow>
            <p className="text-xs text-white/60">{opp.name}'s answer:</p>
            <p className="mt-1 font-display text-2xl font-extrabold">“{game.pending.text}”</p>
            <p className="mt-1 text-xs text-white/60">The player you picked: <b className="text-white">{game.card?.name}</b></p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => act({ do: "judge", correct: true })} className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-emerald-500 font-bold text-white transition active:scale-95 disabled:opacity-50">
                <Check className="size-5" /> Correct
              </button>
              <button disabled={busy} onClick={() => act({ do: "judge", correct: false })} className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-live font-bold text-white transition active:scale-95 disabled:opacity-50">
                <X className="size-5" /> Wrong
              </button>
            </div>
          </Panel>
        </div>
      )}

      {game.status === "playing" && !myTurn && game.phase !== "setup" && game.phase !== "pick" && (
        <div className="mt-3">
          <Waiting text={headline} />
        </div>
      )}

      {error && <p className="mt-2 text-center text-xs text-live">{error}</p>}

      {/* ----- everything that happened ----- */}
      {game.turns.length > 0 && (
        <div className="mt-5 rounded-3xl bg-black/25 p-3 ring-1 ring-white/10">
          <p className="px-1 font-mono text-[10px] tracking-[.18em] text-white/50 uppercase">Turns so far</p>
          {game.turns.map((t, i) => (
            <div key={i} className="mt-2 flex items-center gap-3 rounded-2xl bg-white/[.04] p-2">
              <PlayerBadge name={t.card?.name ?? ""} team={t.card?.team ?? ""} photo={t.card?.photo} className="size-10 rounded-xl text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{t.card?.name}</span>
                <span className="block text-[11px] text-white/60">
                  {name(t.guesser)} {t.correct ? `got it with ${t.used} question${t.used === 1 ? "" : "s"}` : "didn't get it"}
                </span>
              </span>
              <span className={cn("grid size-7 place-items-center rounded-full", t.correct ? "bg-emerald-500" : "bg-live/30")}>{t.correct ? <Check className="size-4" /> : <X className="size-4" />}</span>
            </div>
          ))}
        </div>
      )}

      {/* ----- a turn just ended ----- */}
      <AnimatePresence>
        {reveal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => setReveal(null)}>
            <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-[28px] bg-ink-900 p-6 text-center ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
              <p className="font-display text-2xl font-extrabold">{reveal.correct ? (reveal.guesser === me ? "You got it! 🎉" : `${opp.name} got it`) : reveal.guesser === me ? "Not this time" : `${opp.name} didn't get it`}</p>
              <div className="mt-4 flex justify-center">
                <PlayerBadge name={reveal.card?.name ?? ""} team={reveal.card?.team ?? ""} photo={reveal.card?.photo} className="size-28 rounded-[2rem] text-3xl" />
              </div>
              <p className="mt-3 font-display text-xl font-bold">{reveal.card?.name}</p>
              <p className="text-sm text-white/60">{reveal.card?.team}</p>
              {/* both have guessed in this round: say the round is done, the score, and what's next */}
              {reveal.n % 2 === 0 && (
                <div className="mt-4 rounded-2xl bg-white/[.06] px-3 py-3 ring-1 ring-white/10">
                  <p className="font-mono text-[10px] tracking-[.2em] text-white/55 uppercase">Round {reveal.round} of {game.rounds}</p>
                  <p className="mt-0.5 font-display text-2xl font-black italic">Round {reveal.round} done</p>
                  <p className="mt-1 font-display text-lg font-extrabold tabular-nums">
                    <span className="text-signal">You {myScore}</span> <span className="text-white/40">–</span> {theirScore} {opp.name}
                  </p>
                  <p className="mt-2 text-[11px] font-bold tracking-wider text-signal uppercase">
                    {game.status === "done" ? "That was the last round" : `Next · Round ${reveal.round + 1} of ${game.rounds}${reveal.round + 1 === game.rounds ? " (last round)" : ""}`}
                  </p>
                </div>
              )}
              <Button className="mt-5 w-full" onClick={() => setReveal(null)}>
                {game.status === "done" ? "See the result" : reveal.guesser === me ? `Now pick for ${opp.name}` : "Your turn to guess next"}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

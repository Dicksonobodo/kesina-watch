import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HelpCircle, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { PlayerBadge } from "@/features/sports/Sheets";
import { NamePicker } from "../NamePicker";
import { Banner, WaitingNote } from "./GameHost";

/*
 * Who's Behind You? You see the footballer you picked for the other person; yours stays a
 * mystery. Answer their yes/no questions, ask your own, and guess who you are before they do.
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

function PlayerCard({ card, mystery, label, sub, tone = "white" }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center rounded-3xl p-3 text-center ring-1 backdrop-blur", tone === "signal" ? "bg-signal/10 ring-signal/40" : "bg-black/30 ring-white/10")}>
      <p className="font-mono text-[9px] tracking-[.18em] text-white/60 uppercase">{label}</p>
      <div className="relative mt-2">
        {mystery ? (
          <span className="grid size-24 place-items-center rounded-[1.6rem] bg-gradient-to-b from-slate-700 to-slate-900 ring-2 ring-white/20">
            <span className="font-display text-5xl font-extrabold text-white/80">?</span>
          </span>
        ) : (
          <PlayerBadge name={card?.name ?? ""} team={card?.team ?? ""} photo={card?.photo} className="size-24 rounded-[1.6rem] text-2xl ring-2 ring-white/20" />
        )}
      </div>
      <p className="mt-2 line-clamp-2 min-h-9 text-[14px] leading-tight font-bold">{mystery ? "Who am I?" : card?.name}</p>
      <p className="truncate text-[11px] text-white/60">{sub ?? card?.team}</p>
    </div>
  );
}

const answerTone = { Yes: "bg-emerald-500 text-white", No: "bg-live text-white", "Not sure": "bg-white/20 text-white" };

export default function Behind({ game, move, busy, error }) {
  const players = usePlayers();
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myTurn = game.status === "playing" && game.turn === me;
  const [question, setQuestion] = useState("");
  const [picked, setPicked] = useState(null);
  const [guessing, setGuessing] = useState(false);
  const [flash, setFlash] = useState(null);
  const logEnd = useRef(null);

  const items = useMemo(() => (players ?? []).map((p) => ({ key: p.id, name: p.name, sub: p.team })), [players]);
  useEffect(() => {
    // (a block, not an arrow that returns: newer browsers make scrolling return a promise, which React mustn't get back)
    logEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [game.log.length]);

  // a round just ended: show who everyone was
  const roundKey = game.lastRound ? `${game.lastRound.round}` : "";
  const [seenRound, setSeenRound] = useState(roundKey);
  useEffect(() => {
    if (roundKey && roundKey !== seenRound) setFlash(game.lastRound);
  }, [roundKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(body) {
    try {
      const r = await move(body);
      return r;
    } catch {
      return null;
    }
  }

  async function pick() {
    if (!picked) return;
    const r = await act({ do: "pick", player: picked.key });
    if (r) setPicked(null);
  }
  async function ask(e) {
    e?.preventDefault();
    if (question.trim().length < 3) return;
    const r = await act({ do: "ask", text: question.trim() });
    if (r) setQuestion("");
  }
  async function guess(item) {
    setGuessing(false);
    await act({ do: "guess", player: item.key });
  }

  const myScore = game.score[me] ?? 0;
  const theirScore = game.score[opp.uid] ?? 0;
  const left = game.questionsLeft[me];

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-3">
      <Banner game={game} />

      {/* round and score */}
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-black/30 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-white/80 uppercase ring-1 ring-white/10">
          Round {Math.min(game.round, game.rounds)} of {game.rounds}
        </span>
        <span className="font-display text-lg font-extrabold tabular-nums">
          You {myScore} <span className="text-white/40">–</span> {theirScore} {opp.name}
        </span>
      </div>

      {/* the two players */}
      <div className="mt-3 flex gap-2">
        <PlayerCard label="Your player" mystery={!game.myCard} card={game.myCard} sub={game.myCard ? undefined : "Ask questions to find out"} tone="signal" />
        <PlayerCard label={`${opp.name}'s player`} mystery={!game.theirCard} card={game.theirCard} sub={game.theirCard ? undefined : "You'll pick this"} />
      </div>

      {/* picking */}
      {game.status === "playing" && game.phase === "pick" && (
        <div className="mt-4 rounded-3xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur">
          {myTurn && !game.iPicked ? (
            <>
              <p className="font-display text-lg font-bold">Pick a player for {opp.name} to guess</p>
              <p className="mt-0.5 text-xs text-white/60">They won't see who it is. You will, so you can answer their questions.</p>
              <div className="mt-3">
                {players ? <NamePicker items={items} onPick={setPicked} placeholder="Search any footballer" autoFocus={false} /> : <div className="skeleton h-12 rounded-full" />}
              </div>
              {picked && (
                <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[.06] p-3">
                  <PlayerBadge name={picked.name} team={picked.sub} className="size-12 rounded-xl text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{picked.name}</span>
                    <span className="block truncate text-xs text-white/60">{picked.sub}</span>
                  </span>
                  <Button size="sm" onClick={pick} loading={busy}>
                    Give them this
                  </Button>
                </div>
              )}
            </>
          ) : (
            <WaitingNote game={game} />
          )}
          {!myTurn && game.iPicked && <p className="mt-2 text-center text-xs text-white/60">You picked. Now {opp.name} picks your player.</p>}
        </div>
      )}

      {/* the questions so far */}
      {game.phase === "play" && game.log.some((x) => x.type !== "pick") && (
        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto rounded-3xl bg-black/25 p-3 ring-1 ring-white/10">
          {game.log
            .filter((x) => x.type !== "pick")
            .map((x, i) => {
              const mine = x.by === me;
              return (
                <div key={i} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                  {x.type === "q" ? (
                    <>
                      <span className={cn("max-w-[85%] rounded-[18px] px-3 py-1.5 text-[14px]", mine ? "bg-signal text-ink-950" : "bg-white/[.12]")}>{x.text}</span>
                      {x.answer ? <span className={cn("mt-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold", answerTone[x.answer])}>{x.answer}</span> : <span className="mt-1 text-[11px] text-white/50">waiting for an answer…</span>}
                    </>
                  ) : (
                    <span className={cn("rounded-full px-3 py-1 text-[12px] font-semibold", x.correct ? "bg-emerald-500 text-white" : "bg-live/20 text-live")}>
                      {mine ? "You" : opp.name} guessed {x.text} {x.correct ? "✓" : "✗"}
                    </span>
                  )}
                </div>
              );
            })}
          <span ref={logEnd} />
        </div>
      )}

      {/* your turn */}
      {game.status === "playing" && game.phase === "play" && (
        <div className="mt-4">
          {myTurn && game.pending ? (
            <div className="rounded-3xl bg-black/35 p-4 ring-1 ring-signal/40 backdrop-blur">
              <p className="text-xs text-white/60">
                {opp.name} asks about <b className="text-white">{game.theirCard?.name}</b>:
              </p>
              <p className="mt-1 font-display text-xl font-bold">“{game.pending.text}”</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[["yes", "Yes", "bg-emerald-500"], ["no", "No", "bg-live"], ["maybe", "Not sure", "bg-white/15"]].map(([v, label, c]) => (
                  <button key={v} disabled={busy} onClick={() => act({ do: "answer", answer: v })} className={cn("h-12 rounded-2xl font-bold text-white transition active:scale-95 disabled:opacity-50", c)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : myTurn ? (
            <div className="rounded-3xl bg-black/35 p-4 ring-1 ring-signal/40 backdrop-blur">
              {guessing ? (
                <>
                  <p className="font-display text-lg font-bold">Who are you?</p>
                  <p className="mt-0.5 text-xs text-white/60">A wrong guess costs a question.</p>
                  <div className="mt-3">{players ? <NamePicker items={items} onPick={guess} placeholder="Search the player you think you are" /> : null}</div>
                  <button onClick={() => setGuessing(false)} className="mt-3 text-xs font-semibold text-white/60">
                    Back to asking
                  </button>
                </>
              ) : (
                <>
                  <form onSubmit={ask} className="flex gap-2">
                    <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={140} disabled={left <= 0} placeholder={left > 0 ? "Ask a yes/no question… e.g. Am I a striker?" : "No questions left: make a guess"} className="h-11 min-w-0 flex-1 rounded-full bg-white/[.08] px-4 text-[15px] ring-1 ring-white/15 outline-none placeholder:text-white/40 focus:ring-signal/60" />
                    <button type="submit" disabled={busy || question.trim().length < 3} aria-label="Ask" className="grid size-11 shrink-0 place-items-center rounded-full bg-signal text-ink-950 disabled:bg-white/10 disabled:text-white/40">
                      <Send className="size-[18px]" />
                    </button>
                  </form>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-xs text-white/60">
                      <HelpCircle className="size-3.5" /> {left} question{left === 1 ? "" : "s"} left
                    </span>
                    <Button size="sm" onClick={() => setGuessing(true)}>
                      <Sparkles className="size-4" /> I know who I am
                    </Button>
                  </div>
                  {left <= 0 && (
                    <button onClick={() => act({ do: "pass" })} className="mt-2 text-xs font-semibold text-white/60">
                      Pass my turn
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="rounded-3xl bg-black/25 p-4 text-center ring-1 ring-white/10">
              <WaitingNote game={game} />
              {game.waitingFor && <p className="mt-2 text-xs text-white/60">Your question: “{game.waitingFor.text}”</p>}
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-center text-xs text-live">{error}</p>}

      {/* how to play */}
      {game.phase !== "between" && game.status === "playing" && (
        <p className="mt-4 text-center text-[11px] leading-relaxed text-white/45">
          On your turn: answer their question, then ask one about your own player or guess. First to guess who they are wins the round. {game.maxQuestions} questions each per round.
        </p>
      )}

      {/* who everyone was, after a round */}
      <AnimatePresence>
        {flash && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onClick={() => (setSeenRound(roundKey), setFlash(null))}>
            <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-[28px] bg-ink-900 p-5 text-center ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
              <p className="font-mono text-[11px] tracking-[.2em] text-white/60 uppercase">Round {flash.round}</p>
              <p className="mt-1 font-display text-2xl font-extrabold">{flash.winner === me ? "You got it! 🎉" : flash.winner ? `${opp.name} got it` : "Nobody got it"}</p>
              <div className="mt-4 flex gap-2">
                <PlayerCard label="You were" card={flash.cards[me]} tone="signal" />
                <PlayerCard label={`${opp.name} was`} card={flash.cards[opp.uid]} />
              </div>
              <Button className="mt-4 w-full" onClick={() => (setSeenRound(roundKey), setFlash(null))}>
                {game.status === "done" ? "See the result" : "Next round"}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

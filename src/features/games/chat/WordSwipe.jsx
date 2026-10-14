import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { Banner } from "./GameHost";

/*
 * Word Swipe: drag through neighbouring letters (diagonals too) to spell words of 3+ letters.
 * The board arrives with a list of word fingerprints (hashes) so a word can be checked instantly
 * without the words themselves being sent; the server re-checks everything when you finish.
 */

const SIZE = 4;
const hash = (w) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < w.length; i++) {
    h ^= w.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};
const scoreWord = (w) => (w.length <= 3 ? 100 : w.length === 4 ? 400 : w.length === 5 ? 800 : w.length === 6 ? 1400 : w.length === 7 ? 1800 : 2200);
const letter = (cell) => (cell === "Q" ? "Qu" : cell);
const adjacent = (a, b) => Math.abs(Math.floor(a / SIZE) - Math.floor(b / SIZE)) <= 1 && Math.abs((a % SIZE) - (b % SIZE)) <= 1 && a !== b;

export default function WordSwipe({ game, move, busy }) {
  const [started, setStarted] = useState(false);
  if (game.status === "done") return <Results game={game} />;
  if (game.finished) return <Waiting game={game} />;
  if (!game.started && !started) return <Intro game={game} onStart={async () => (await move({ type: "begin" }), setStarted(true))} busy={busy} />;
  if (!game.board) return null;
  return <Play game={game} move={move} />;
}

/* ---------- before and after ---------- */

function Intro({ game, onStart, busy }) {
  const opp = game.players.find((p) => p.uid !== game.me);
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
      <div className="grid grid-cols-4 gap-1.5">
        {"WORDSWIPEGAMES!?".split("").slice(0, 16).map((c, i) => (
          <span key={i} className={cn("grid size-12 place-items-center rounded-xl font-display text-xl font-extrabold", [1, 6, 11, 12].includes(i) ? "bg-signal text-ink-950" : "bg-white/[.08]")}>
            {c}
          </span>
        ))}
      </div>
      <h2 className="mt-6 font-display text-3xl font-extrabold tracking-tight">Word Swipe</h2>
      <p className="mt-3 text-[15px] leading-relaxed text-mist-500">
        Swipe through touching letters (diagonals count) to make words of 3 or more letters. Longer words score a lot more. You have {game.seconds} seconds, then {opp?.name} gets the same board. Highest score wins.
      </p>
      <Button size="lg" className="mt-7" onClick={onStart} loading={busy}>
        Start · {game.seconds}s
      </Button>
    </div>
  );
}

function Waiting({ game }) {
  const opp = game.players.find((p) => p.uid !== game.me);
  return (
    <div className="mx-auto max-w-sm px-6 py-10 text-center">
      <p className="font-mono text-[11px] tracking-[.2em] text-mist-500 uppercase">Your round</p>
      <p className="mt-2 font-display text-6xl font-extrabold text-signal tabular-nums">{game.myScore.toLocaleString()}</p>
      <p className="mt-1 text-sm text-mist-500">{game.myWords.length} words</p>
      <div className="mt-6 flex flex-wrap justify-center gap-1.5">
        {game.myWords.map((w) => (
          <span key={w} className="rounded-full bg-white/[.07] px-2.5 py-1 text-xs font-medium">
            {w}
          </span>
        ))}
      </div>
      <p className="mt-8 flex items-center justify-center gap-2 text-sm text-mist-300">
        <span className="size-2 animate-pulse rounded-full bg-signal" /> Waiting for {opp?.name} to play…
      </p>
      <p className="mt-2 text-xs text-mist-500">You can leave. The result will show up in your chat.</p>
    </div>
  );
}

function Results({ game }) {
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const mine = game.results[me] ?? { score: 0, words: [] };
  const theirs = game.results[opp.uid] ?? { score: 0, words: [] };
  const theirSet = new Set(theirs.words);
  const mySet = new Set(mine.words);
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <Banner game={game} />
      <div className="grid grid-cols-2 gap-3">
        {[
          ["You", mine, mySet, theirSet],
          [opp.name, theirs, theirSet, mySet],
        ].map(([name, r, own, rival]) => (
          <div key={name} className="rounded-3xl bg-white/[.04] p-4 ring-1 ring-white/[.08]">
            <p className="truncate text-center text-xs font-semibold text-mist-500">{name}</p>
            <p className="text-center font-display text-3xl font-extrabold tabular-nums">{r.score.toLocaleString()}</p>
            <p className="mb-3 text-center text-[11px] text-mist-500">{r.words.length} words</p>
            <div className="flex max-h-56 flex-wrap justify-center gap-1 overflow-y-auto">
              {r.words.map((w) => (
                <span key={w} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", rival.has(w) ? "bg-white/[.07] text-mist-300" : "bg-signal/20 text-signal")}>
                  {w}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-mist-500">Highlighted words were found by only one of you.</p>
    </div>
  );
}

/* ---------- the round ---------- */

function Play({ game, move }) {
  const hashes = useMemo(() => new Set(game.hashes ?? []), [game.hashes]);
  const key = `ws-${game.id}`;
  const [found, setFound] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? "[]");
    } catch {
      return [];
    }
  });
  const [path, setPath] = useState([]);
  const [flash, setFlash] = useState(null); // { text, tone }
  const [left, setLeft] = useState(game.seconds);
  const [sending, setSending] = useState(false);
  const board = useRef(null);
  const dragging = useRef(false);
  const submitted = useRef(false);
  const skew = useRef(game.now - Date.now());

  const score = found.reduce((n, w) => n + scoreWord(w), 0);
  const word = path.map((i) => letter(game.board[i])).join("").toLowerCase();

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(found));
    } catch {
      /* storage blocked */
    }
  }, [found, key]);

  const finish = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSending(true);
    try {
      await move({ type: "submit", words: found });
    } catch {
      submitted.current = false;
    } finally {
      setSending(false);
    }
  }, [move, found]);

  // The clock follows the server's start time, so reloading the page doesn't give extra time.
  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() + skew.current - game.startedAt) / 1000;
      const remaining = Math.max(0, game.seconds - elapsed);
      setLeft(remaining);
      if (remaining <= 0) finish();
    };
    tick();
    const t = setInterval(tick, 200);
    return () => clearInterval(t);
  }, [game.startedAt, game.seconds, finish]);

  const cellAt = (e) => {
    const rect = board.current.getBoundingClientRect();
    const cell = rect.width / SIZE;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / cell);
    const row = Math.floor(y / cell);
    if (col < 0 || col >= SIZE || row < 0 || row >= SIZE) return null;
    const dx = x - (col + 0.5) * cell;
    const dy = y - (row + 0.5) * cell;
    return Math.hypot(dx, dy) < cell * 0.4 ? row * SIZE + col : null; // the middle of a tile only, so diagonals are easy
  };

  function down(e) {
    if (left <= 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const i = cellAt(e);
    if (i == null) return;
    dragging.current = true;
    setFlash(null);
    setPath([i]);
  }
  function movePtr(e) {
    if (!dragging.current) return;
    const i = cellAt(e);
    if (i == null) return;
    setPath((p) => {
      const last = p.at(-1);
      if (i === last) return p;
      if (p.length > 1 && i === p.at(-2)) return p.slice(0, -1); // slide back to undo a letter
      if (adjacent(last, i) && !p.includes(i)) return [...p, i];
      return p;
    });
  }
  function up() {
    if (!dragging.current) return;
    dragging.current = false;
    const w = word;
    setPath([]);
    if (w.length < 3) return;
    if (found.includes(w)) return setFlash({ text: `${w} · already found`, tone: "warn" });
    if (hashes.has(hash(w))) {
      setFound((f) => [w, ...f]);
      setFlash({ text: `${w} +${scoreWord(w)}`, tone: "ok" });
    } else setFlash({ text: `${w} isn't a word`, tone: "bad" });
  }

  const valid = word.length >= 3 && hashes.has(hash(word)) && !found.includes(word);
  const centres = path.map((i) => [((i % SIZE) + 0.5) * (100 / SIZE), (Math.floor(i / SIZE) + 0.5) * (100 / SIZE)]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-3 select-none">
      <div className="flex w-full items-center justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[.2em] text-mist-500 uppercase">Score</p>
          <p className="font-display text-3xl leading-none font-extrabold tabular-nums">{score.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] tracking-[.2em] text-mist-500 uppercase">Time</p>
          <p className={cn("font-display text-3xl leading-none font-extrabold tabular-nums", left < 10 && "text-live")}>{Math.ceil(left)}</p>
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[.07]">
        <div className={cn("h-full rounded-full transition-[width] duration-200 ease-linear", left < 10 ? "bg-live" : "bg-signal")} style={{ width: `${(left / game.seconds) * 100}%` }} />
      </div>

      <div className="my-3 grid h-10 place-items-center">
        {word ? (
          <span className={cn("font-display text-3xl font-extrabold tracking-wider uppercase", valid ? "text-signal" : "text-white")}>{word}</span>
        ) : flash ? (
          <motion.span key={flash.text + score} initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={cn("text-lg font-bold", flash.tone === "ok" ? "text-signal" : flash.tone === "warn" ? "text-amber-300" : "text-live")}>
            {flash.text}
          </motion.span>
        ) : (
          <span className="text-sm text-mist-500">Swipe across touching letters</span>
        )}
      </div>

      <div ref={board} onPointerDown={down} onPointerMove={movePtr} onPointerUp={up} onPointerCancel={up} className="relative aspect-square w-full max-w-[min(100%,52vh)] touch-none rounded-3xl bg-white/[.04] p-0 ring-1 ring-white/10">
        <div className="absolute inset-0 grid grid-cols-4 gap-0 p-1.5">
          {game.board.map((c, i) => (
            <div key={i} className="grid place-items-center p-1">
              <span className={cn("grid size-full place-items-center rounded-2xl font-display text-3xl font-extrabold transition-colors", path.includes(i) ? (valid ? "bg-signal text-ink-950" : "bg-white text-ink-950") : "bg-white/[.1] text-white")}>{letter(c)}</span>
            </div>
          ))}
        </div>
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full">
          {centres.length > 1 && <polyline points={centres.map((p) => p.join(",")).join(" ")} fill="none" stroke={valid ? "var(--color-signal)" : "#fff"} strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        </svg>
      </div>

      <div className="mt-4 flex max-h-24 w-full flex-wrap gap-1.5 overflow-y-auto">
        {found.map((w) => (
          <span key={w} className="rounded-full bg-white/[.07] px-2.5 py-1 text-xs font-medium">
            {w}
          </span>
        ))}
        {found.length === 0 && <span className="text-xs text-mist-700">{game.total} words are hiding on this board.</span>}
      </div>
      <Button variant="subtle" className="mt-3" onClick={finish} loading={sending}>
        Finish early
      </Button>
    </div>
  );
}

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Banner } from "./GameHost";

/*
 * Tic Tac Toe. Whoever started is X and goes first. Tap a square on your turn; the move is sent
 * to the other player. The marks draw themselves in, and a winning three gets a line through it.
 */

const X_COLOR = "var(--color-signal)";
const O_COLOR = "#ff5d8f";
const centre = (i) => [50 + (i % 3) * 100, 50 + Math.floor(i / 3) * 100];

/** An X or an O drawn as strokes, animating in. */
export function Mark({ mark, i, size = 26, delay = 0, faded = false }) {
  const [cx, cy] = centre(i);
  const draw = { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } };
  const glow = { filter: `drop-shadow(0 0 6px ${mark === "X" ? "rgba(198,255,61,.55)" : "rgba(255,93,143,.55)"})` };
  if (mark === "X")
    return (
      <g style={{ ...glow, opacity: faded ? 0.25 : 1, transition: "opacity .4s" }} stroke={X_COLOR} strokeWidth="11" strokeLinecap="round" fill="none">
        <motion.path d={`M${cx - size} ${cy - size} L${cx + size} ${cy + size}`} {...draw} transition={{ duration: 0.18, delay }} />
        <motion.path d={`M${cx + size} ${cy - size} L${cx - size} ${cy + size}`} {...draw} transition={{ duration: 0.18, delay: delay + 0.15 }} />
      </g>
    );
  return (
    <g style={{ ...glow, opacity: faded ? 0.25 : 1, transition: "opacity .4s" }}>
      <motion.circle cx={cx} cy={cy} r={size + 2} stroke={O_COLOR} strokeWidth="11" fill="none" strokeLinecap="round" {...draw} transition={{ duration: 0.32, delay }} />
    </g>
  );
}

function PlayerPill({ name, mark, active, me, result }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl px-3 py-2.5 ring-1 transition", active ? "bg-white/[.1] ring-white/30 shadow-[0_0_30px_-8px_rgba(255,255,255,.35)]" : "bg-black/25 ring-white/10")}>
      <svg viewBox="0 0 100 100" className="size-8 shrink-0">
        {mark === "X" ? (
          <g stroke={X_COLOR} strokeWidth="14" strokeLinecap="round">
            <path d="M24 24 L76 76" />
            <path d="M76 24 L24 76" />
          </g>
        ) : (
          <circle cx="50" cy="50" r="28" stroke={O_COLOR} strokeWidth="14" fill="none" />
        )}
      </svg>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">{me ? "You" : name}</span>
        <span className={cn("block text-[11px]", active || result === "Winner" ? "font-semibold text-white" : "text-white/50")}>{result ?? (active ? (me ? "Your turn" : "Their turn") : "Waiting")}</span>
      </span>
    </div>
  );
}

export default function TicTacToe({ game, move, busy, error }) {
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myMark = game.marks[me];
  const theirMark = game.marks[opp.uid];
  const myTurn = game.status === "playing" && game.turn === me;
  const [pending, setPending] = useState(null); // the square just tapped, shown before the server answers
  const [hover, setHover] = useState(null);

  async function place(i) {
    if (!myTurn || busy || pending !== null || game.board[i]) return;
    setPending(i);
    try {
      await move({ do: "place", cell: i });
    } catch {
      /* the reason shows below */
    } finally {
      setPending(null);
    }
  }

  const board = game.board.map((m, i) => m || (i === pending ? myMark : ""));
  const line = game.line;
  const done = game.status === "done";
  const [a, , c] = line ?? [];
  const [x1, y1] = line ? centre(a) : [0, 0];
  const [x2, y2] = line ? centre(c) : [0, 0];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ext = 34; // the strike runs a little past the end marks

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-3 select-none">
      <Banner game={game} />

      <div className="flex w-full gap-2">
        <PlayerPill name="You" mark={myMark} active={myTurn} me result={done ? (game.winner === "draw" ? "Draw" : game.winner === me ? "Winner" : "") || undefined : undefined} />
        <PlayerPill name={opp.name} mark={theirMark} active={game.status === "playing" && game.turn === opp.uid} result={done ? (game.winner === "draw" ? "Draw" : game.winner === opp.uid ? "Winner" : "") || undefined : undefined} />
      </div>

      {/* the board */}
      <div className={cn("relative mt-6 aspect-square w-full transition-[max-width] duration-500", done ? "max-w-[min(100%,30vh)]" : "max-w-[min(100%,48vh)]")}>
        <div className="absolute inset-0 rounded-[32px] bg-black/25 ring-1 ring-white/10 backdrop-blur-sm" />
        <svg viewBox="0 0 300 300" className="relative size-full">
          {/* the grid */}
          <g stroke="rgba(255,255,255,.22)" strokeWidth="5" strokeLinecap="round">
            {[100, 200].map((v) => (
              <g key={v}>
                <line x1={v} y1="22" x2={v} y2="278" />
                <line x1="22" y1={v} x2="278" y2={v} />
              </g>
            ))}
          </g>
          {/* where your mark would go */}
          {myTurn && hover !== null && !board[hover] && <Mark mark={myMark} i={hover} faded />}
          {/* the last move */}
          {game.last !== null && !done && (
            <motion.circle key={`last${game.last}`} cx={centre(game.last)[0]} cy={centre(game.last)[1]} r="44" fill="rgba(255,255,255,.05)" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.6] }} transition={{ duration: 0.8 }} />
          )}
          {board.map((m, i) => (m ? <Mark key={`${i}${m}`} mark={m} i={i} faded={done && line && !line.includes(i)} /> : null))}
          {/* the winning three */}
          {line && (
            <motion.path
              d={`M${x1 - (dx / len) * ext} ${y1 - (dy / len) * ext} L${x2 + (dx / len) * ext} ${y2 + (dy / len) * ext}`}
              stroke="#fff"
              strokeWidth="9"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.2, ease: "easeOut" }}
              style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,.8))" }}
            />
          )}
        </svg>
        {/* the squares you tap */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-[2%]">
          {board.map((m, i) => (
            <button
              key={i}
              aria-label={m ? `Square ${i + 1}: ${m}` : `Square ${i + 1}, empty`}
              disabled={!myTurn || Boolean(m) || busy}
              onClick={() => place(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className={cn("rounded-2xl transition", myTurn && !m ? "cursor-pointer active:bg-white/[.06]" : "cursor-default")}
            />
          ))}
        </div>
      </div>

      <div className="mt-5 h-6 text-center text-sm">
        {game.status === "playing" &&
          (myTurn ? (
            <span className="font-semibold text-signal">Your turn: tap a square</span>
          ) : (
            <span className="flex items-center gap-2 text-white/70">
              <span className="size-2 animate-pulse rounded-full bg-signal" /> Waiting for {opp.name}…
            </span>
          ))}
        {done && game.winner === "draw" && <span className="text-white/70">Nobody got three in a row.</span>}
      </div>
      {error && <p className="mt-1 text-xs text-live">{error}</p>}
      <p className="mt-3 text-center text-[11px] text-white/40">{myMark === "X" ? "You're X and you went first." : `You're O. ${opp.name} is X and went first.`} Three in a row wins.</p>
    </div>
  );
}

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Banner } from "./GameHost";

/*
 * Naija Whot for two. Tap a glowing card to play it, tap the market to pick. The server holds the
 * market and your opponent's cards, and checks every move.
 */

const SHAPES = ["circle", "triangle", "cross", "square", "star"];
const COLOR = { circle: "#dc2626", triangle: "#16a34a", cross: "#2563eb", square: "#d97706", star: "#c026d3" };
const RULES = [
  ["1", "Hold on", "play again"],
  ["2", "Pick two", "they pick 2 (or play a 2 too)"],
  ["5", "Pick three", "they pick 3 (or play a 5 too)"],
  ["8", "Suspension", "they miss a turn"],
  ["14", "General market", "they pick 1, you play again"],
  ["20", "Whot", "wild: name the shape"],
];

export function Shape({ shape, size = 20, color }) {
  const c = color ?? COLOR[shape];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      {shape === "circle" && <circle cx="12" cy="12" r="9.5" fill={c} />}
      {shape === "triangle" && <path d="M12 2.5 22 21H2z" fill={c} />}
      {shape === "cross" && <path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill={c} />}
      {shape === "square" && <rect x="3" y="3" width="18" height="18" rx="2" fill={c} />}
      {shape === "star" && <path d="m12 1.5 3 7.2 7.8.6-6 5.1 1.9 7.6L12 17.7 5.3 22l1.9-7.6-6-5.1 7.8-.6z" fill={c} />}
    </svg>
  );
}

export function WhotCard({ card, back, size = "md", playable, dim, onClick, selected }) {
  const dims = size === "lg" ? "h-36 w-24" : size === "sm" ? "h-14 w-10" : "h-28 w-[4.6rem]";
  if (back) {
    return (
      <span className={cn("grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-rose-700 to-red-900 ring-2 ring-white/70", dims)}>
        <span className={cn("rounded-full bg-white/90 font-display font-extrabold text-rose-700", size === "sm" ? "px-1 text-[7px]" : "px-2 py-0.5 text-[10px]")}>WHOT</span>
      </span>
    );
  }
  const whot = card.n === 20;
  const color = whot ? "#111" : COLOR[card.shape];
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      className={cn("relative block shrink-0 overflow-hidden rounded-xl bg-[#fdf6e3] text-left shadow-lg transition", dims, playable && "-translate-y-3 ring-4 ring-signal", dim && "opacity-45", selected && "-translate-y-4", onClick && "active:scale-95")}
      style={{ color }}
    >
      {whot ? (
        <span className="grid size-full place-items-center bg-gradient-to-br from-neutral-900 to-neutral-700">
          <span className="font-display text-xl leading-none font-extrabold text-white">20</span>
          <span className="-mt-3 bg-gradient-to-r from-red-500 via-yellow-400 to-sky-400 bg-clip-text font-display text-[11px] font-extrabold tracking-wider text-transparent">WHOT</span>
        </span>
      ) : (
        <>
          <span className="absolute top-1 left-1.5 font-display text-[15px] leading-none font-extrabold">{card.n}</span>
          <span className="absolute top-1 right-1.5">
            <Shape shape={card.shape} size={size === "sm" ? 8 : 12} />
          </span>
          <span className="absolute inset-0 grid place-items-center">
            <Shape shape={card.shape} size={size === "lg" ? 52 : size === "sm" ? 20 : 40} />
          </span>
          <span className="absolute right-1.5 bottom-1 rotate-180 font-display text-[15px] leading-none font-extrabold">{card.n}</span>
        </>
      )}
    </Tag>
  );
}

export default function Whot({ game, move, busy, error }) {
  const [choosing, setChoosing] = useState(null); // a Whot card waiting for a shape
  const [rules, setRules] = useState(false);
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myTurn = game.status === "playing" && game.turn === me;
  const pending = game.pending.count > 0;

  async function play(card, shape) {
    setChoosing(null);
    try {
      await move({ do: "play", card: card.id, shape });
    } catch {
      /* the server's reason is shown below */
    }
  }
  async function draw() {
    try {
      await move({ do: "draw" });
    } catch {
      /* shown below */
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-3 py-3">
      <Banner game={game} />

      {/* opponent */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{opp.name}</span>
        <span className="font-mono text-[11px] text-mist-500">{game.counts[opp.uid]} cards</span>
        {game.counts[opp.uid] === 1 && <span className="rounded-full bg-live px-2 py-0.5 text-[10px] font-bold text-white">LAST CARD</span>}
      </div>
      <div className="relative mt-2 flex h-16 justify-center">
        {Array.from({ length: Math.min(game.counts[opp.uid], 12) }).map((_, i, all) => (
          <span key={i} className="absolute" style={{ left: `calc(50% + ${(i - (all.length - 1) / 2) * 20}px - 1.25rem)`, transform: `rotate(${(i - (all.length - 1) / 2) * 3}deg)` }}>
            <WhotCard back size="sm" />
          </span>
        ))}
      </div>

      {/* table */}
      <div className="my-4 flex flex-1 items-center justify-center gap-6">
        <button onClick={draw} disabled={!myTurn || busy} className="group relative" aria-label={pending ? `Pick ${game.pending.count}` : "Pick from the market"}>
          <span className="absolute inset-0 translate-x-1 translate-y-1 rounded-xl bg-rose-950" />
          <WhotCard back size="lg" />
          <span className={cn("absolute inset-x-0 -bottom-6 text-center text-[11px] font-semibold", myTurn ? "text-signal" : "text-mist-500")}>{pending && myTurn ? `Pick ${game.pending.count}` : `Market · ${game.market}`}</span>
        </button>
        <div className="relative">
          <AnimatePresence mode="popLayout">
            <motion.div key={game.top.id} initial={{ y: -40, rotate: -12, opacity: 0 }} animate={{ y: 0, rotate: 4, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}>
              <WhotCard card={game.top} size="lg" />
            </motion.div>
          </AnimatePresence>
          {game.demand && (
            <span className="absolute -top-3 -right-3 grid size-9 place-items-center rounded-full bg-white shadow-lg ring-2 ring-signal" title={`Next player must play ${game.demand}`}>
              <Shape shape={game.demand} size={20} />
            </span>
          )}
        </div>
      </div>

      {/* status */}
      <div className="mb-2 min-h-12 text-center">
        {game.status === "playing" && (
          <p className={cn("text-[15px] font-bold", myTurn ? "text-signal" : "text-mist-300")}>
            {myTurn ? (pending ? `Play a ${game.pending.rank}, or pick ${game.pending.count}` : game.playable.length ? "Your turn · play a glowing card" : "Nothing to play · pick from the market") : `Waiting for ${opp.name}…`}
          </p>
        )}
        <p className="mt-0.5 min-h-4 truncate text-xs text-mist-500">{game.log.at(-1) ? `${game.log.at(-1).by ? (game.log.at(-1).by === me ? "You " : `${opp.name} `) : ""}${game.log.at(-1).text}` : ""}</p>
        {error && <p className="mt-1 text-xs text-live">{error}</p>}
      </div>

      {/* my hand */}
      <div className="-mx-3 overflow-x-auto px-3 pt-4 pb-3">
        <div className="mx-auto flex w-max gap-2">
          {game.hand.map((c) => {
            const ok = game.playable.includes(c.id);
            return <WhotCard key={c.id} card={c} playable={myTurn && ok} dim={myTurn && !ok} onClick={myTurn && ok && !busy ? () => (c.n === 20 ? setChoosing(c) : play(c)) : undefined} />;
          })}
        </div>
      </div>
      <button onClick={() => setRules((r) => !r)} className="mx-auto text-xs font-semibold text-mist-500 hover:text-mist-100">
        {rules ? "Hide rules" : "How to play"}
      </button>
      {rules && (
        <div className="mt-2 rounded-2xl bg-white/[.04] p-3 text-xs ring-1 ring-white/[.08]">
          <p className="mb-2 text-mist-300">Match the top card by shape or number. Can't? Pick one from the market. First to empty their hand wins.</p>
          {RULES.map(([n, name, what]) => (
            <p key={n} className="flex gap-2 py-0.5">
              <b className="w-6 text-signal">{n}</b>
              <span>
                <b>{name}</b> · <span className="text-mist-500">{what}</span>
              </span>
            </p>
          ))}
        </div>
      )}

      {/* the end: show what was left in hand */}
      {game.status === "done" && game.handsAtEnd && (
        <div className="mt-3 rounded-2xl bg-white/[.04] p-3 ring-1 ring-white/[.08]">
          {game.players.map((p) => (
            <div key={p.uid} className="mb-2 last:mb-0">
              <p className="mb-1 text-[11px] text-mist-500">{p.uid === me ? "Your" : `${p.name}'s`} cards left</p>
              <div className="flex flex-wrap gap-1">{game.handsAtEnd[p.uid].length ? game.handsAtEnd[p.uid].map((c) => <WhotCard key={c.id} card={c} size="sm" />) : <span className="text-xs text-signal">None 🎉</span>}</div>
            </div>
          ))}
        </div>
      )}

      {/* choose a shape for a Whot card */}
      <AnimatePresence>
        {choosing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] grid place-items-end bg-black/60 p-4 sm:place-items-center" onClick={() => setChoosing(null)}>
            <motion.div initial={{ y: 40 }} animate={{ y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-ink-900 p-5 ring-1 ring-white/10">
              <p className="text-center font-display text-lg font-bold">Which shape do you want?</p>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {SHAPES.map((s) => (
                  <button key={s} onClick={() => play(choosing, s)} className="grid aspect-square place-items-center rounded-2xl bg-[#fdf6e3] transition active:scale-95">
                    <Shape shape={s} size={30} />
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

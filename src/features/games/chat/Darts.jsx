import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Banner, WaitingNote } from "./GameHost";

/*
 * Darts, 301. No aiming marks: pick up the dart and flick it at the board. The direction of the
 * flick sends it left or right; the speed decides the height (too soft drops short, too hard sails
 * over the top). The server turns the flick into a landing spot, adds a little wobble, and scores it.
 */

const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const R = { bull: 6.35 / 170, outerBull: 15.9 / 170, trebleIn: 99 / 170, trebleOut: 107 / 170, doubleIn: 162 / 170, edge: 1 };
const VIEW = 1.28;

const pt = (r, deg) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];
const f = (n) => n.toFixed(4);
function wedge(r0, r1, a0, a1) {
  const [x0, y0] = pt(r1, a0);
  const [x1, y1] = pt(r1, a1);
  const [x2, y2] = pt(r0, a1);
  const [x3, y3] = pt(r0, a0);
  return `M${f(x0)} ${f(y0)} A${r1} ${r1} 0 0 1 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${r0} ${r0} 0 0 0 ${f(x3)} ${f(y3)}Z`;
}

const Board = ({ children }) => {
  const sectors = useMemo(
    () =>
      ORDER.flatMap((n, i) => {
        const a0 = i * 18 - 9;
        const a1 = a0 + 18;
        const dark = i % 2 === 0;
        const ring = dark ? "#c62828" : "#1b8a3a";
        return [
          <path key={`i${i}`} d={wedge(R.outerBull, R.trebleIn, a0, a1)} fill={dark ? "#161616" : "#efe2bf"} />,
          <path key={`t${i}`} d={wedge(R.trebleIn, R.trebleOut, a0, a1)} fill={ring} />,
          <path key={`o${i}`} d={wedge(R.trebleOut, R.doubleIn, a0, a1)} fill={dark ? "#161616" : "#efe2bf"} />,
          <path key={`d${i}`} d={wedge(R.doubleIn, R.edge, a0, a1)} fill={ring} />,
          <text key={`n${i}`} x={pt(1.13, i * 18)[0]} y={pt(1.13, i * 18)[1] + 0.045} textAnchor="middle" fontSize="0.13" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
            {n}
          </text>,
        ];
      }),
    [],
  );
  return (
    <>
      <circle r="1.22" fill="#0b0b0f" stroke="#2a2a33" strokeWidth="0.02" />
      {sectors}
      <circle r={R.outerBull} fill="#1b8a3a" />
      <circle r={R.bull} fill="#c62828" />
      {/* the thin wires */}
      <g stroke="#cfd3d8" strokeOpacity=".35" strokeWidth="0.004" fill="none">
        {[R.outerBull, R.trebleIn, R.trebleOut, R.doubleIn, R.edge].map((r) => (
          <circle key={r} r={r} />
        ))}
        {ORDER.map((_, i) => {
          const [x0, y0] = pt(R.outerBull, i * 18 - 9);
          const [x1, y1] = pt(R.edge, i * 18 - 9);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} />;
        })}
      </g>
      {children}
    </>
  );
};

/* The dart you throw: the tip is at the top centre, the flights at the bottom. */
function DartSprite({ className }) {
  return (
    <svg viewBox="0 0 24 104" className={className} aria-hidden>
      <path d="M12 0 15.5 20h-7z" fill="#e5e7eb" />
      <rect x="8.5" y="20" width="7" height="34" rx="2.5" fill="#d4a24c" />
      <rect x="8.5" y="26" width="7" height="2" fill="#92661e" />
      <rect x="8.5" y="34" width="7" height="2" fill="#92661e" />
      <rect x="10.5" y="54" width="3" height="16" fill="#9ca3af" />
      <path d="M12 62 2 100l10-12 10 12z" fill="var(--color-signal)" />
      <path d="M12 62v34" stroke="#0a0a0f" strokeOpacity=".35" strokeWidth="1.2" />
    </svg>
  );
}

const SPRITE_W = 26; // px; the dart is 26 wide and 4.3 times as tall
const SPRITE_H = SPRITE_W * (104 / 24);

/** Same sums as the server (api/_lib/games/cg/darts.js), used only to start the dart flying. */
function aimFromFlick({ x0, y0, dx, dy, ms }) {
  if (dy >= -0.02) return null;
  const speed = -dy / (ms / 1000);
  const y = Math.max(-2, Math.min(2, (speed - 4.5) * 0.4));
  const x = Math.max(-2, Math.min(2, x0 + (dx / -dy) * Math.max(0.2, y - y0)));
  return [x, y];
}

export default function Darts({ game, move, busy, error }) {
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myTurn = game.status === "playing" && game.turn === me;
  const box = useRef(null);
  const svg = useRef(null);
  const [held, setHeld] = useState(null); // { x, y, tilt } px: the dart in your fingers
  const [flight, setFlight] = useState(null); // { key, from, to, landed } px
  const [size, setSize] = useState({ w: 320, board: 320, tray: 150 });
  const [last, setLast] = useState(null); // { dart, key }
  const [notice, setNotice] = useState("");
  const samples = useRef([]);

  // measure the board so board units can be turned into pixels
  useEffect(() => {
    const measure = () => {
      if (!svg.current) return;
      const w = svg.current.getBoundingClientRect().width;
      setSize({ w, board: w, tray: Math.round(w * 0.5) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const toPx = (x, y) => ({ x: ((x + VIEW) / (2 * VIEW)) * size.board, y: ((-y + VIEW) / (2 * VIEW)) * size.board });
  const toUnits = (px, py) => ({ x: (px / size.board) * (2 * VIEW) - VIEW, y: -((py / size.board) * (2 * VIEW) - VIEW) });
  const rest = { x: size.w / 2, y: size.board + size.tray * 0.08 }; // where the waiting dart's tip is
  const local = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top - (e.pointerType === "touch" ? 40 : 0) }; // the tip sits above your finger
  };

  function down(e) {
    if (!myTurn || busy || flight || game.dartsLeft <= 0) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* some pointers can't be captured; the throw still works */
    }
    const p = local(e);
    samples.current = [{ t: performance.now(), ...p }];
    setNotice("");
    setHeld({ ...p, tilt: 0 });
  }
  function drag(e) {
    if (!held) return;
    const p = local(e);
    const now = performance.now();
    samples.current = [...samples.current.filter((s) => now - s.t < 160), { t: now, ...p }];
    const first = samples.current[0];
    const tilt = Math.max(-35, Math.min(35, ((p.x - first.x) / Math.max(1, now - first.t)) * 12));
    setHeld({ ...p, tilt });
  }
  async function up() {
    if (!held) return;
    const now = performance.now();
    const recent = samples.current.filter((s) => now - s.t < 110);
    const first = recent[0] ?? samples.current[0];
    const end = samples.current.at(-1);
    setHeld(null);
    if (!first || !end || end === first) return;
    const ms = Math.max(16, end.t - first.t);
    const start = toUnits(end.x, end.y);
    const flick = { x0: start.x, y0: start.y, dx: (end.x - first.x) / size.board, dy: (end.y - first.y) / size.board, ms };
    const guess = aimFromFlick(flick);
    // a gentle drag just puts the dart back: only a real flick throws it
    if (!guess || -flick.dy / (ms / 1000) < 1.4) return setNotice("Flick it up towards the board, a bit faster.");
    const key = Date.now();
    const target = toPx(guess[0], guess[1]);
    setFlight({ key, from: { x: end.x, y: end.y }, to: target, landed: false });
    try {
      const r = await move({ do: "throw", flick });
      const d = r.result.dart;
      setFlight((f) => f && { ...f, to: toPx(d.x, d.y), landed: true });
      setLast({ dart: d, key });
      if (r.result.bust) setNotice("Bust! Back to where you started the turn.");
      else if (d.ring === "miss") setNotice(d.y < -0.9 ? "Too soft: it dropped short. Flick faster." : d.y > 0.9 ? "Too hard: it sailed over. Flick a little slower." : "Off the side. Flick straighter.");
      setTimeout(() => setLast((l) => (l?.key === key ? null : l)), 2600);
    } catch {
      /* the server's reason is shown below */
    } finally {
      setTimeout(() => setFlight(null), 500);
    }
  }

  const shown = [...game.thrown];
  if (last && !shown.some((d) => d.x === last.dart.x && d.y === last.dart.y)) shown.push(last.dart);
  const lastTurn = game.history.at(-1);
  const hasDart = myTurn && game.dartsLeft > 0;
  const dartAt = held ?? rest;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-2 select-none">
      <Banner game={game} />
      <div className="grid w-full grid-cols-2 gap-2">
        {[{ uid: me, name: "You" }, { uid: opp.uid, name: opp.name }].map((p) => (
          <div key={p.uid} className={cn("rounded-2xl px-4 py-2 ring-1 backdrop-blur transition", game.turn === p.uid ? "bg-white/[.12] ring-signal/70" : "bg-black/25 ring-white/10")}>
            <p className="truncate text-[11px] font-semibold text-white/60">{p.name}</p>
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums">{game.left[p.uid]}</p>
          </div>
        ))}
      </div>

      <div className="mt-2 flex h-7 items-center gap-3">
        {game.status === "playing" && myTurn && (
          <>
            <span className="text-sm font-bold text-signal">Your throw</span>
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("size-2.5 rounded-full", i < game.dartsLeft ? "bg-signal" : "bg-white/15")} />
              ))}
            </span>
          </>
        )}
        {game.status === "playing" && !myTurn && <WaitingNote game={game} />}
      </div>

      <div ref={box} onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up} className={cn("relative w-full max-w-[min(100%,46vh)] touch-none", hasDart && !flight ? "cursor-grab active:cursor-grabbing" : "")}>
        <svg ref={svg} viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`} className="aspect-square w-full drop-shadow-[0_18px_30px_rgba(0,0,0,.6)]">
          <Board>
            {shown.map((d, i) => (
              <motion.g key={`${d.x}${d.y}${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {/* a dart stuck in the board: tip in the hole, barrel and flights sticking out */}
                <path d={`M${d.x} ${-d.y} l.02 .17`} stroke="#d4a24c" strokeWidth="0.032" strokeLinecap="round" />
                <path d={`M${d.x + 0.02} ${-d.y + 0.15} l-.045 .1 .105 -.035z`} fill="var(--color-signal)" />
                <circle cx={d.x} cy={-d.y} r="0.02" fill="#fff" stroke="#000" strokeWidth="0.008" />
              </motion.g>
            ))}
          </Board>
        </svg>

        {/* where the dart waits */}
        <div style={{ height: size.tray }} />
        {hasDart && !flight && (
          <div
            className="pointer-events-none absolute"
            style={{ left: dartAt.x - SPRITE_W / 2, top: dartAt.y, width: SPRITE_W, height: SPRITE_H, transformOrigin: "50% 0%", transform: `rotate(${held?.tilt ?? 0}deg) scale(${held ? 1.08 : 1})`, transition: held ? "none" : "left .25s, top .25s, transform .25s" }}
          >
            <DartSprite className="size-full drop-shadow-[0_6px_6px_rgba(0,0,0,.6)]" />
          </div>
        )}

        {/* the dart in the air */}
        <AnimatePresence>
          {flight && (
            <motion.div
              key={flight.key}
              className="pointer-events-none absolute top-0 left-0"
              style={{ width: SPRITE_W, height: SPRITE_H, transformOrigin: "50% 0%" }}
              initial={{ x: flight.from.x - SPRITE_W / 2, y: flight.from.y, scale: 1.1 }}
              animate={{ x: flight.to.x - SPRITE_W / 2, y: flight.to.y, scale: flight.landed ? 0.48 : 0.6 }}
              transition={{ duration: flight.landed ? 0.14 : 0.3, ease: "easeOut" }}
              exit={{ opacity: 0 }}
            >
              <DartSprite className="size-full drop-shadow-[0_8px_8px_rgba(0,0,0,.55)]" />
            </motion.div>
          )}
        </AnimatePresence>
        {hasDart && !held && !flight && (
          <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[11px] text-white/55">Grab the dart and flick it up. Faster flicks go higher.</p>
        )}
      </div>

      <div className="mt-1 h-9 text-center">
        <AnimatePresence mode="wait">
          {last ? (
            <motion.p key={last.key} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="font-display text-2xl font-extrabold text-signal">
              {last.dart.label} {last.dart.score > 0 && `· ${last.dart.score}`}
            </motion.p>
          ) : (
            <p className="text-xs text-white/55">{lastTurn ? `${lastTurn.by === me ? "You" : opp.name}: ${lastTurn.darts.join(" · ")}${lastTurn.bust ? " · bust" : ` → ${lastTurn.left}`}` : ""}</p>
          )}
        </AnimatePresence>
      </div>
      {notice && <p className="text-sm font-semibold text-amber-300">{notice}</p>}
      {error && <p className="text-xs text-live">{error}</p>}
      <p className="mt-1 max-w-xs text-center text-[11px] text-white/40">301: take your score down to exactly zero. Go below zero and the turn is a bust.</p>
    </div>
  );
}

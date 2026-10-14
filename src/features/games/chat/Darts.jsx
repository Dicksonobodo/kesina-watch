import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Banner } from "./GameHost";

/*
 * Darts, 301. A dart waits at the bottom: drag up to aim it at the board (the cross-hair wobbles
 * a little, so steady hands win) and let go to throw it. Drag back down to cancel. The server
 * decides exactly where the dart lands and what it scores.
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

export default function Darts({ game, move, busy, error }) {
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myTurn = game.status === "playing" && game.turn === me;
  const box = useRef(null);
  const svg = useRef(null);
  const [aim, setAim] = useState(null); // { x, y } in board units (y up)
  const [wobble, setWobble] = useState([0, 0]);
  const [flight, setFlight] = useState(null); // { key, from, to, landed } in pixels inside the box
  const [size, setSize] = useState({ w: 320, board: 320, tray: 130 });
  const [last, setLast] = useState(null); // { dart, key }
  const [notice, setNotice] = useState("");
  const dragging = useRef(false);

  // the cross-hair wobble (only while you are aiming)
  useEffect(() => {
    if (!aim) return;
    let id;
    const tick = (t) => {
      setWobble([0.016 * Math.sin(t / 130) + 0.008 * Math.sin(t / 53), 0.016 * Math.cos(t / 110) + 0.008 * Math.cos(t / 61)]);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [aim]);

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
  const rest = { x: size.w / 2, y: size.board + size.tray * 0.06 }; // where the waiting dart's tip is

  const toBoard = (e) => {
    const rect = svg.current.getBoundingClientRect();
    let x = ((e.clientX - rect.left) / rect.width) * (2 * VIEW) - VIEW;
    let y = -(((e.clientY - rect.top) / rect.height) * (2 * VIEW) - VIEW);
    if (e.pointerType === "touch") y += 0.24; // keep the aim point above the finger
    return { x, y };
  };

  function down(e) {
    if (!myTurn || busy || flight) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragging.current = true;
    setNotice("");
    setAim(toBoard(e));
  }
  const drag = (e) => dragging.current && setAim(toBoard(e));
  async function up() {
    if (!dragging.current) return;
    dragging.current = false;
    const a = aim;
    setAim(null);
    if (!a || Math.hypot(a.x, a.y) > 1.3) return; // let go below the board: cancelled
    const target = { x: a.x + wobble[0], y: a.y + wobble[1] };
    const key = Date.now();
    setFlight({ key, from: rest, to: toPx(target.x, target.y), landed: false });
    try {
      const r = await move({ do: "throw", x: target.x, y: target.y });
      const d = r.result.dart;
      setFlight((f) => f && { ...f, to: toPx(d.x, d.y), landed: true });
      setLast({ dart: d, key });
      if (r.result.bust) setNotice("Bust! Back to where you started the turn.");
      setTimeout(() => setLast((l) => (l?.key === key ? null : l)), 2600);
    } catch {
      /* the server's reason is shown below */
    } finally {
      setTimeout(() => setFlight(null), 450);
    }
  }

  const shown = [...game.thrown];
  if (last && !shown.some((d) => d.x === last.dart.x && d.y === last.dart.y)) shown.push(last.dart);
  const turnName = game.turn === me ? "You" : opp.name;
  const lastTurn = game.history.at(-1);

  // the waiting dart turns toward where you are aiming
  const aimPx = aim ? toPx(aim.x + wobble[0], aim.y + wobble[1]) : null;
  const angle = aimPx ? (Math.atan2(aimPx.x - rest.x, rest.y - aimPx.y) * 180) / Math.PI : 0;
  const hasDart = game.status === "playing" && game.dartsLeft > 0;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-3 select-none">
      <Banner game={game} />
      <div className="grid w-full grid-cols-2 gap-2">
        {[{ uid: me, name: "You" }, { uid: opp.uid, name: opp.name }].map((p) => (
          <div key={p.uid} className={cn("rounded-2xl px-4 py-2.5 ring-1 transition", game.turn === p.uid ? "bg-signal/10 ring-signal/60" : "bg-white/[.04] ring-white/[.08]")}>
            <p className="truncate text-[11px] font-semibold text-mist-500">{p.name}</p>
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums">{game.left[p.uid]}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex h-8 items-center gap-3">
        {game.status === "playing" && (
          <>
            <span className={cn("text-sm font-bold", myTurn ? "text-signal" : "text-mist-300")}>{myTurn ? "Your throw" : `${turnName} is throwing…`}</span>
            <span className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("size-2.5 rounded-full", i < game.dartsLeft ? "bg-signal" : "bg-white/15")} />
              ))}
            </span>
          </>
        )}
      </div>

      <div ref={box} onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up} className={cn("relative w-full max-w-[min(100%,46vh)] touch-none", myTurn && !busy && !flight ? "cursor-grab" : "")}>
        <svg ref={svg} viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`} className="aspect-square w-full">
          <Board>
            {shown.map((d, i) => (
              <motion.g key={`${d.x}${d.y}${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                {/* a dart stuck in the board: tip in the hole, barrel and flights sticking out */}
                <path d={`M${d.x} ${-d.y} l.02 .17`} stroke="#d4a24c" strokeWidth="0.032" strokeLinecap="round" />
                <path d={`M${d.x + 0.02} ${-d.y + 0.15} l-.045 .1 .105 -.035z`} fill="var(--color-signal)" />
                <circle cx={d.x} cy={-d.y} r="0.02" fill="#fff" stroke="#000" strokeWidth="0.008" />
              </motion.g>
            ))}
            {aim && (
              <g transform={`translate(${aim.x + wobble[0]} ${-(aim.y + wobble[1])})`} stroke="#fff" strokeWidth="0.014" fill="none">
                <circle r="0.07" />
                <path d="M-0.12 0H-0.04M0.04 0H0.12M0 -0.12V-0.04M0 0.04V0.12" />
                <circle r="0.008" fill="#fff" />
              </g>
            )}
          </Board>
        </svg>

        {/* the dashed line from the dart to where it will go */}
        {aimPx && (
          <svg className="pointer-events-none absolute inset-0" width={size.w} height={size.board + size.tray} aria-hidden>
            <line x1={rest.x} y1={rest.y} x2={aimPx.x} y2={aimPx.y} stroke="#fff" strokeOpacity=".5" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" />
          </svg>
        )}

        {/* the tray: the dart you are about to throw */}
        <div className="relative" style={{ height: size.tray }}>
          <p className="absolute inset-x-0 bottom-0 text-center text-[11px] text-mist-500">{myTurn && hasDart && !flight ? (aim ? "Let go to throw · drag back down to cancel" : "Drag the dart up to the board") : ""}</p>
        </div>
        {hasDart && !flight && (
          <div className="pointer-events-none absolute" style={{ left: rest.x - SPRITE_W / 2, top: rest.y, width: SPRITE_W, height: SPRITE_H, transformOrigin: "50% 0%", transform: `rotate(${angle}deg)`, opacity: myTurn ? 1 : 0.35, transition: aim ? "none" : "transform .2s" }}>
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
              initial={{ x: flight.from.x - SPRITE_W / 2, y: flight.from.y, scale: 1.25, rotate: angle }}
              animate={{ x: flight.to.x - SPRITE_W / 2, y: flight.to.y, scale: flight.landed ? 0.5 : 0.62, rotate: 0 }}
              transition={{ duration: flight.landed ? 0.16 : 0.34, ease: "easeOut" }}
              exit={{ opacity: 0 }}
            >
              <DartSprite className="size-full drop-shadow-[0_8px_8px_rgba(0,0,0,.55)]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-2 h-9 text-center">
        <AnimatePresence mode="wait">
          {last ? (
            <motion.p key={last.key} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="font-display text-2xl font-extrabold text-signal">
              {last.dart.label} {last.dart.score > 0 && `· ${last.dart.score}`}
            </motion.p>
          ) : (
            <p className="text-xs text-mist-500">{myTurn ? "Hold steady: the cross-hair wobbles." : lastTurn ? `${lastTurn.by === me ? "You" : opp.name}: ${lastTurn.darts.join(" · ")}${lastTurn.bust ? " · bust" : ` → ${lastTurn.left}`}` : ""}</p>
          )}
        </AnimatePresence>
      </div>
      {notice && <p className="text-sm font-semibold text-amber-300">{notice}</p>}
      {error && <p className="text-xs text-live">{error}</p>}
      <p className="mt-2 max-w-xs text-center text-[11px] text-mist-700">301: take your score down to exactly zero. Go below zero and the turn is a bust.</p>
    </div>
  );
}

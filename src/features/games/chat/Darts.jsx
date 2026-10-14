import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { Banner } from "./GameHost";

/*
 * Darts, 301. Drag on the board to aim (the cross-hair wobbles a little, so steady hands win),
 * release to throw. The server decides exactly where the dart lands and what it scores.
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

export default function Darts({ game, move, busy, error }) {
  const me = game.me;
  const opp = game.players.find((p) => p.uid !== me);
  const myTurn = game.status === "playing" && game.turn === me;
  const svg = useRef(null);
  const [aim, setAim] = useState(null); // { x, y } in board units (y up)
  const [wobble, setWobble] = useState([0, 0]);
  const [flying, setFlying] = useState(false);
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

  const toBoard = (e) => {
    const rect = svg.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * (2 * VIEW) - VIEW;
    const y = -(((e.clientY - rect.top) / rect.height) * (2 * VIEW) - VIEW);
    const lift = e.pointerType === "touch" ? 0.24 : 0; // keep the aim point above the finger
    return { x, y: y + lift };
  };

  function down(e) {
    if (!myTurn || busy || flying) return;
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
    if (!a) return;
    setFlying(true);
    try {
      const r = await move({ do: "throw", x: a.x + wobble[0], y: a.y + wobble[1] });
      setLast({ dart: r.result.dart, key: Date.now() });
      if (r.result.bust) setNotice("Bust! Back to where you started the turn.");
      setTimeout(() => setLast(null), 2600);
    } catch {
      /* the server's reason is shown below */
    } finally {
      setFlying(false);
    }
  }

  const shown = [...game.thrown];
  if (last && !shown.some((d) => d.x === last.dart.x && d.y === last.dart.y)) shown.push(last.dart);
  const turnName = game.turn === me ? "You" : opp.name;
  const lastTurn = game.history.at(-1);

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

      <svg ref={svg} viewBox={`${-VIEW} ${-VIEW} ${2 * VIEW} ${2 * VIEW}`} onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up} className={cn("aspect-square w-full max-w-[min(100%,50vh)] touch-none", myTurn && !busy ? "cursor-crosshair" : "")}>
        <Board>
          {shown.map((d, i) => (
            <motion.g key={`${d.x}${d.y}${i}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <circle cx={d.x} cy={-d.y} r="0.045" fill="#fff" stroke="#000" strokeWidth="0.012" />
              <circle cx={d.x} cy={-d.y} r="0.016" fill="var(--color-signal)" />
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

      <div className="mt-3 h-9 text-center">
        <AnimatePresence mode="wait">
          {last ? (
            <motion.p key={last.key} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="font-display text-2xl font-extrabold text-signal">
              {last.dart.label} {last.dart.score > 0 && `· ${last.dart.score}`}
            </motion.p>
          ) : (
            <p className="text-xs text-mist-500">{myTurn ? "Drag to aim, let go to throw. Hold steady: the cross-hair wobbles." : lastTurn ? `${lastTurn.by === me ? "You" : opp.name}: ${lastTurn.darts.join(" · ")}${lastTurn.bust ? " · bust" : ` → ${lastTurn.left}`}` : ""}</p>
          )}
        </AnimatePresence>
      </div>
      {notice && <p className="text-sm font-semibold text-amber-300">{notice}</p>}
      {error && <p className="text-xs text-live">{error}</p>}
      <p className="mt-2 max-w-xs text-center text-[11px] text-mist-700">301: take your score down to exactly zero. Go below zero and the turn is a bust.</p>
    </div>
  );
}

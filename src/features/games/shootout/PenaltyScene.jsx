import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import {
  BALL_R, clamp, clamp01, DISTANCE_NAMES, divePlan, easeInOut, easeOut, GOAL, goalLine, goalPoint, H, KEEPER, kickPose, lerp, lerpPose, placeKeeper,
  plantPose, project, runPose, scaleAtGoal, SHOOTER_SPOT, shirtNumber, STAND, surname, sway, W,
} from "./geometry";
import { PlayerPhoto } from "./SquadPicker";

/*
 * The penalty, drawn from behind the shooter. What it shows is set by `script`:
 *
 *   { type: "idle" }                  the next taker waits behind the ball, the keeper bounces
 *   { type: "aim", onShoot }          run-up, then the pause to aim with the direction line; let go to shoot
 *   { type: "frozen" }                your shot is struck and waiting for the keeper (live games)
 *   { type: "keep", value, onPick }   you're the keeper: pick a side
 *   { type: "replay", kick, from }    play a kick out ("runup" or straight from the "strike"), then onDone
 */

const RUN = 950;
const BLEND = 170;
const PAUSE = 140;
const CONTACT_MS = 110;
const FLIGHT = { 12: 520, 18: 650, 25: 790 };
const AFTER = 680;
const HOLD = 1150;
const AIM_LIMIT = 8000;

const SKIN = "#b9825a";
const HAIR = "#1d140c";

/* ---------- the stadium (drawn once per distance) ---------- */

function Stadium({ yards, uid }) {
  const zBoards = goalLine(yards) + 4.6;
  const bTop = project(0, 0.9, zBoards).y;
  const bBottom = project(0, 0, zBoards).y;
  const stripes = [];
  for (let z = -9; z < zBoards; z += 3) {
    const y1 = project(0, 0, z + 3).y;
    const y0 = project(0, 0, z).y;
    stripes.push(<rect key={z} x="0" y={Math.max(bBottom, y1)} width={W} height={Math.max(0, Math.min(H, y0) - Math.max(bBottom, y1))} fill={Math.round(z / 3) % 2 ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.06)"} />);
  }
  const boards = [];
  for (let i = 0, x = -60; x < W; x += 104, i++) {
    boards.push(
      <g key={i}>
        <rect x={x} y={bTop} width="104" height={bBottom - bTop} fill={i % 2 ? "#101018" : "var(--color-signal)"} />
        <text x={x + 52} y={(bTop + bBottom) / 2 + 4.2} textAnchor="middle" fontSize="11.5" fontWeight="900" letterSpacing=".06em" fill={i % 2 ? "#fff" : "#0b0b10"} fontFamily="system-ui, sans-serif">
          {i % 2 ? "MIND GAMES" : "DIXON WATCH"}
        </text>
      </g>,
    );
  }
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070d" />
          <stop offset="1" stopColor="#141a2b" />
        </linearGradient>
        <pattern id={`${uid}crowd`} width="11" height="9" patternUnits="userSpaceOnUse">
          <circle cx="2.5" cy="2.6" r="1.7" fill="#c9a27e" />
          <rect x="0.6" y="4.1" width="3.8" height="4.4" rx="1.4" fill="#e11d48" />
          <circle cx="8.2" cy="3.4" r="1.7" fill="#7a5236" />
          <rect x="6.3" y="5" width="3.8" height="4" rx="1.4" fill="#2563eb" />
        </pattern>
        <pattern id={`${uid}crowd2`} width="13" height="10" patternUnits="userSpaceOnUse" patternTransform="translate(5 4)">
          <circle cx="3" cy="3" r="1.8" fill="#e8c39e" />
          <rect x="1" y="4.6" width="4" height="4.6" rx="1.5" fill="var(--color-signal)" />
          <circle cx="9.5" cy="2.2" r="1.6" fill="#5b3a24" />
          <rect x="7.6" y="3.7" width="3.8" height="5" rx="1.4" fill="#f8fafc" />
        </pattern>
        <linearGradient id={`${uid}pitch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d6b35" />
          <stop offset="1" stopColor="#2f8f47" />
        </linearGradient>
        <linearGradient id={`${uid}shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#05070d" stopOpacity=".95" />
          <stop offset=".55" stopColor="#05070d" stopOpacity=".35" />
          <stop offset="1" stopColor="#05070d" stopOpacity=".15" />
        </linearGradient>
        <radialGradient id={`${uid}flood`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={bTop} fill={`url(#${uid}sky)`} />
      {/* the stand: tiers of people, darker towards the roof */}
      <rect y={bTop * 0.22} width={W} height={bTop * 0.78} fill={`url(#${uid}crowd)`} opacity=".55" />
      <rect y={bTop * 0.22} width={W} height={bTop * 0.78} fill={`url(#${uid}crowd2)`} opacity=".35" />
      <rect width={W} height={bTop} fill={`url(#${uid}shade)`} />
      {[0.42, 0.66, 0.86].map((f) => (
        <line key={f} x1="0" x2={W} y1={bTop * f} y2={bTop * f} stroke="#000" strokeOpacity=".35" strokeWidth="1.5" />
      ))}
      <rect y="0" width={W} height={bTop * 0.2} fill="#03040a" />
      {/* floodlights */}
      <circle cx="18" cy={bTop * 0.14} r="60" fill={`url(#${uid}flood)`} />
      <circle cx={W - 18} cy={bTop * 0.14} r="60" fill={`url(#${uid}flood)`} />
      {/* camera flashes */}
      {Array.from({ length: 9 }).map((_, i) => (
        <circle key={i} cx={(i * 97 + 31) % W} cy={bTop * (0.3 + ((i * 37) % 60) / 100)} r="1.6" fill="#fff" className="so-flash" style={{ animationDelay: `${(i * 0.73) % 4}s` }} />
      ))}
      {/* advertising boards */}
      {boards}
      <rect x="0" y={bTop} width={W} height="1.2" fill="#fff" opacity=".25" />
      {/* the pitch */}
      <rect x="0" y={bBottom} width={W} height={H - bBottom} fill={`url(#${uid}pitch)`} />
      {stripes}
      <PitchLines yards={yards} />
    </g>
  );
}

function PitchLines({ yards }) {
  const zg = goalLine(yards);
  const seg = (x1, z1, x2, z2, key) => {
    const za = Math.max(z1, -8);
    const zb = Math.max(z2, -8);
    if (z1 < -8 && z2 < -8) return null;
    const a = project(x1, 0, za);
    const b = project(x2, 0, zb);
    return <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
  };
  const spot = project(0, 0, zg - 10.97);
  const arc = [];
  for (let i = 0; i <= 40; i++) {
    const a = Math.PI * (0.19 + (0.62 * i) / 40);
    const z = zg - 10.97 - Math.sin(a) * 9.15;
    if (z > zg - 16.5) continue;
    const p = project(Math.cos(a) * 9.15, 0, Math.max(z, -8));
    arc.push(`${p.x},${p.y}`);
  }
  return (
    <g stroke="#fff" strokeOpacity=".82" strokeWidth="1.6" fill="none" strokeLinecap="round">
      {seg(-40, zg, 40, zg, "gl")}
      {seg(-9.16, zg, -9.16, zg - 5.5, "6l")}
      {seg(9.16, zg, 9.16, zg - 5.5, "6r")}
      {seg(-9.16, zg - 5.5, 9.16, zg - 5.5, "6f")}
      {seg(-20.16, zg, -20.16, zg - 16.5, "bl")}
      {seg(20.16, zg, 20.16, zg - 16.5, "br")}
      {zg - 16.5 > -8 && seg(-20.16, zg - 16.5, 20.16, zg - 16.5, "bf")}
      {arc.length > 1 && <polyline points={arc.join(" ")} />}
      {yards !== 12 && <ellipse cx={spot.x} cy={spot.y} rx={2.6 * (spot.s / 30)} ry={1.1 * (spot.s / 30)} fill="#fff" fillOpacity=".85" stroke="none" />}
    </g>
  );
}

/* ---------- the goal ---------- */

function netLines(yards, bulge) {
  const zg = goalLine(yards);
  const { half, height } = GOAL;
  const topBack = [height * 0.94, zg + 1.0];
  const bottomBack = [0, zg + 1.9];
  const push = (X, Y, Z) => {
    if (!bulge?.amt) return project(X, Y, Z);
    const d = Math.hypot(X - bulge.X, Y - bulge.Y);
    return project(X, Y, Z + bulge.amt * Math.exp(-(d * d) / 0.9));
  };
  const lines = [];
  const poly = (pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  // back panel (slanting from the top-back bar down to the ground)
  for (let X = -half; X <= half + 0.01; X += half / 9) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(push(X, lerp(bottomBack[0], topBack[0], t), lerp(bottomBack[1], topBack[1], t)));
    }
    lines.push(poly(pts));
  }
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const Y = lerp(bottomBack[0], topBack[0], t);
    const Z = lerp(bottomBack[1], topBack[1], t);
    const pts = [];
    for (let X = -half; X <= half + 0.01; X += half / 6) pts.push(push(X, Y, Z));
    lines.push(poly(pts));
  }
  // roof
  for (let X = -half; X <= half + 0.01; X += half / 9) lines.push(poly([project(X, height, zg), push(X, topBack[0], topBack[1])]));
  for (let i = 1; i <= 2; i++) {
    const Z = lerp(zg, topBack[1], i / 3);
    lines.push(poly([project(-half, height, Z), project(half, height, Z)]));
  }
  // sides
  for (const X of [-half, half]) {
    for (let i = 0; i <= 5; i++) {
      const Y = (height * i) / 5;
      lines.push(poly([project(X, Y, zg), project(X, Y * 0.97, lerp(bottomBack[1], topBack[1], Y / height))]));
    }
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      lines.push(poly([project(X, 0, lerp(zg, bottomBack[1], t)), project(X, height * (1 - 0.06 * t), lerp(zg, topBack[1], t))]));
    }
  }
  return lines;
}

const Net = memo(function Net({ yards, bulge }) {
  const lines = netLines(yards, bulge);
  const zg = goalLine(yards);
  const corners = [project(-GOAL.half, 0, zg), project(-GOAL.half, GOAL.height, zg), project(GOAL.half, GOAL.height, zg), project(GOAL.half, 0, zg)];
  return (
    <g stroke="#fff" strokeOpacity=".36" strokeWidth=".7" fill="none">
      {/* the inside of the goal is a little darker, so it stands out from the boards behind */}
      <path d={`M${corners.map((c) => `${c.x} ${c.y}`).join(" L")} Z`} fill="#03140a" fillOpacity=".38" stroke="none" />
      {lines.map((points, i) => (
        <polyline key={i} points={points} />
      ))}
    </g>
  );
});

function Frame({ yards, shake }) {
  const zg = goalLine(yards);
  const { half, height } = GOAL;
  const a = project(-half, 0, zg);
  const b = project(-half, height, zg);
  const c = project(half, height, zg);
  const d = project(half, 0, zg);
  const w = 0.12 * a.s;
  return (
    <g transform={shake ? `translate(${Math.sin(shake * 60) * shake * 2.2} 0)` : undefined}>
      <path d={`M${a.x} ${a.y} L${b.x} ${b.y} L${c.x} ${c.y} L${d.x} ${d.y}`} fill="none" stroke="#000" strokeOpacity=".25" strokeWidth={w + 1.6} strokeLinejoin="round" />
      <path d={`M${a.x} ${a.y} L${b.x} ${b.y} L${c.x} ${c.y} L${d.x} ${d.y}`} fill="none" stroke="#f8fafc" strokeWidth={w} strokeLinejoin="round" />
      <path d={`M${a.x + w * 0.18} ${a.y} L${b.x + w * 0.18} ${b.y + w * 0.2} L${c.x - w * 0.18} ${c.y + w * 0.2} L${d.x - w * 0.18} ${d.y}`} fill="none" stroke="#cbd5e1" strokeWidth={w * 0.3} strokeLinejoin="round" opacity=".7" />
      <ellipse cx={(a.x + d.x) / 2} cy={a.y + 1} rx={(d.x - a.x) / 2} ry="2.2" fill="#000" opacity=".18" />
    </g>
  );
}

/* ---------- people ---------- */

function Limb({ a, b, w, color }) {
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeLinecap="round" />;
}

/** The shooter from behind: shirt with name and number. `joints` are in world metres. */
function Shooter({ joints, kit, name, root }) {
  const p = {};
  for (const k in joints) p[k] = project(...joints[k]);
  const s = project(root[0], 0, root[1]).s;
  const shadow = project(root[0], 0, root[1]);
  const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const torso = [p.shL, p.shR, p.hipR, p.hipL];
  const centre = { x: (p.shL.x + p.shR.x + p.hipL.x + p.hipR.x) / 4, y: (p.shL.y + p.shR.y + p.hipL.y + p.hipR.y) / 4 };
  const legs = [["L", -1], ["R", 1]];
  return (
    <g>
      <ellipse cx={shadow.x} cy={shadow.y} rx={0.42 * s} ry={0.1 * s} fill="#000" opacity=".28" />
      {legs.map(([side]) => {
        const hip = p[`hip${side}`];
        const knee = p[`knee${side}`];
        const foot = p[`foot${side}`];
        return (
          <g key={side}>
            <Limb a={hip} b={knee} w={0.17 * s} color={SKIN} />
            <Limb a={knee} b={foot} w={0.13 * s} color={kit.socks} />
            <Limb a={mid(knee, foot, 0.7)} b={foot} w={0.135 * s} color="#f8fafc" />
            <ellipse cx={foot.x} cy={foot.y} rx={0.1 * s} ry={0.06 * s} fill="#0b0b10" />
          </g>
        );
      })}
      {/* shorts */}
      <path d={`M${p.hipL.x - 0.07 * s} ${p.hipL.y - 0.03 * s} L${p.hipR.x + 0.07 * s} ${p.hipR.y - 0.03 * s} L${mid(p.hipR, p.kneeR, 0.38).x + 0.06 * s} ${mid(p.hipR, p.kneeR, 0.38).y} L${mid(p.hipL, p.kneeL, 0.38).x - 0.06 * s} ${mid(p.hipL, p.kneeL, 0.38).y} Z`} fill={kit.shorts} stroke={kit.shorts} strokeWidth={0.05 * s} strokeLinejoin="round" />
      {/* arms behind the body first */}
      {["L", "R"].map((side) => (
        <g key={side}>
          <Limb a={p[`sh${side}`]} b={p[`el${side}`]} w={0.13 * s} color={kit.shirt} />
          <Limb a={p[`el${side}`]} b={p[`hand${side}`]} w={0.095 * s} color={SKIN} />
          <circle cx={p[`hand${side}`].x} cy={p[`hand${side}`].y} r={0.055 * s} fill={SKIN} />
        </g>
      ))}
      {/* shirt (the back) */}
      <path d={`M${torso.map((q) => `${q.x} ${q.y}`).join(" L")} Z`} fill={kit.shirt} stroke={kit.shirt} strokeWidth={0.1 * s} strokeLinejoin="round" />
      <path d={`M${p.shL.x} ${p.shL.y} L${p.hipL.x} ${p.hipL.y}`} stroke="#000" strokeOpacity=".14" strokeWidth={0.07 * s} strokeLinecap="round" />
      <text x={centre.x} y={centre.y - 0.16 * s} textAnchor="middle" fontSize={0.075 * s} fontWeight="800" fill={kit.number} fontFamily="system-ui, sans-serif" letterSpacing=".04em">
        {surname(name)}
      </text>
      <text x={centre.x} y={centre.y + 0.1 * s} textAnchor="middle" fontSize={0.26 * s} fontWeight="900" fill={kit.number} fontFamily="system-ui, sans-serif">
        {shirtNumber(name)}
      </text>
      {/* head from behind */}
      <Limb a={p.neck} b={p.head} w={0.1 * s} color={SKIN} />
      <circle cx={p.head.x - 0.12 * s} cy={p.head.y + 0.01 * s} r={0.03 * s} fill={SKIN} />
      <circle cx={p.head.x + 0.12 * s} cy={p.head.y + 0.01 * s} r={0.03 * s} fill={SKIN} />
      <circle cx={p.head.x} cy={p.head.y} r={0.12 * s} fill={HAIR} />
    </g>
  );
}

/** The keeper, facing us, in a long-sleeved kit and big gloves. */
function Keeper({ joints, kit }) {
  const p = {};
  for (const k in joints) p[k] = project(...joints[k]);
  const s = project(0, 0, joints.hipL[2]).s;
  const mid = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const ground = project((joints.footL[0] + joints.footR[0]) / 2, 0, joints.hipL[2]);
  const height = Math.max(0, Math.min(joints.footL[1], joints.footR[1], joints.hipL[1] - 0.5));
  const torso = [p.shL, p.shR, p.hipR, p.hipL];
  return (
    <g>
      <ellipse cx={ground.x} cy={ground.y} rx={0.55 * s} ry={0.09 * s} fill="#000" opacity={0.3 * clamp01(1 - height)} />
      {["L", "R"].map((side) => (
        <g key={side}>
          <Limb a={p[`hip${side}`]} b={p[`knee${side}`]} w={0.17 * s} color={kit.shorts} />
          <Limb a={p[`knee${side}`]} b={p[`foot${side}`]} w={0.13 * s} color={kit.socks} />
          <ellipse cx={p[`foot${side}`].x} cy={p[`foot${side}`].y} rx={0.09 * s} ry={0.055 * s} fill="#0b0b10" />
        </g>
      ))}
      <path d={`M${p.hipL.x} ${p.hipL.y} L${p.hipR.x} ${p.hipR.y} L${mid(p.hipR, p.kneeR, 0.4).x} ${mid(p.hipR, p.kneeR, 0.4).y} L${mid(p.hipL, p.kneeL, 0.4).x} ${mid(p.hipL, p.kneeL, 0.4).y} Z`} fill={kit.shorts} stroke={kit.shorts} strokeWidth={0.08 * s} strokeLinejoin="round" />
      <path d={`M${torso.map((q) => `${q.x} ${q.y}`).join(" L")} Z`} fill={kit.shirt} stroke={kit.shirt} strokeWidth={0.12 * s} strokeLinejoin="round" />
      <path d={`M${mid(p.shL, p.hipL, 0.35).x} ${mid(p.shL, p.hipL, 0.35).y} L${mid(p.shR, p.hipR, 0.35).x} ${mid(p.shR, p.hipR, 0.35).y}`} stroke="#000" strokeOpacity=".22" strokeWidth={0.06 * s} />
      {["L", "R"].map((side) => (
        <g key={side}>
          <Limb a={p[`sh${side}`]} b={p[`el${side}`]} w={0.13 * s} color={kit.shirt} />
          <Limb a={p[`el${side}`]} b={p[`hand${side}`]} w={0.11 * s} color={kit.shirt} />
          <circle cx={p[`hand${side}`].x} cy={p[`hand${side}`].y} r={0.1 * s} fill="#f8fafc" stroke={kit.trim} strokeWidth={0.035 * s} />
        </g>
      ))}
      <Limb a={p.neck} b={p.head} w={0.1 * s} color={SKIN} />
      <circle cx={p.head.x} cy={p.head.y} r={0.12 * s} fill={SKIN} />
      <path d={`M${p.head.x - 0.12 * s} ${p.head.y - 0.01 * s} a${0.12 * s} ${0.12 * s} 0 0 1 ${0.24 * s} 0 Z`} fill={HAIR} />
    </g>
  );
}

function Ball({ at, spin = 0, opacity = 1 }) {
  const p = project(...at);
  const g = project(at[0], 0, at[2]);
  const r = Math.max(2.2, BALL_R * p.s * 1.12);
  const lift = clamp01((at[1] - BALL_R) / 2.5);
  return (
    <g opacity={opacity}>
      <ellipse cx={g.x} cy={g.y} rx={r * (1.05 - lift * 0.4)} ry={r * 0.32 * (1.05 - lift * 0.4)} fill="#000" opacity={0.35 * (1 - lift * 0.7)} />
      <g transform={`translate(${p.x} ${p.y}) rotate(${spin})`}>
        <circle r={r} fill="#f8fafc" />
        <path d={`M0 ${-r * 0.42} L${r * 0.4} ${-r * 0.13} L${r * 0.25} ${r * 0.34} L${-r * 0.25} ${r * 0.34} L${-r * 0.4} ${-r * 0.13} Z`} fill="#111827" />
        <path d={`M${-r * 0.95} ${-r * 0.3} l${r * 0.35} ${r * 0.05} M${r * 0.95} ${-r * 0.3} l${-r * 0.35} ${r * 0.05} M0 ${r * 0.95} l0 ${-r * 0.35}`} stroke="#111827" strokeWidth={r * 0.14} />
        <circle r={r} fill="none" stroke="#94a3b8" strokeWidth={r * 0.08} />
        <circle cx={-r * 0.35} cy={-r * 0.4} r={r * 0.28} fill="#fff" opacity=".55" />
      </g>
    </g>
  );
}

/* ---------- what happens on a kick ---------- */

/** Where the ball reaches the goal (world metres) and where the keeper's hands go. */
function plan(kick, yards) {
  const zg = goalLine(yards);
  const [bx, by] = goalPoint(kick.x, kick.y, yards);
  const ballY = Math.max(BALL_R, by);
  const saved = kick.result === "save";
  const target = [bx, ballY, saved ? zg - 0.32 : zg];
  let keeper;
  const seed = Math.abs(Math.sin(kick.i * 12.9898 + kick.x * 78.233)) % 1;
  if (kick.dive === "C") {
    const high = saved ? ballY > 1.25 : seed > 0.4;
    keeper = { pose: high ? "star" : "ready", tx: saved ? bx * 0.7 : 0, ty: high ? clamp((saved ? ballY : 2.1) - 1.92, 0.08, 0.55) : 0, theta: 0 };
  } else {
    const side = kick.dive === "L" ? -1 : 1;
    const towardsBall = saved || (kick.zone === kick.dive && !["goal"].includes(kick.result));
    const hx = towardsBall ? clamp(bx, -3.55, 3.55) * (saved ? 1 : 0.92) : side * (2.3 + seed * 0.6);
    const hy = towardsBall ? clamp(ballY, 0.25, 2.25) : 0.55 + seed * 1.1;
    keeper = { pose: side < 0 ? "left" : "right", ...divePlan(hx, hy) };
  }
  return { target, keeper, zg };
}

function flightPoint(target, yards, u) {
  const arc = { 12: 0.18, 18: 0.6, 25: 1.05 }[yards] * (target[1] > 1.6 ? 0.55 : 1);
  const curl = -target[0] * 0.08;
  return [target[0] * u + curl * Math.sin(Math.PI * u), lerp(BALL_R, target[1], u) + arc * Math.sin(Math.PI * u), target[2] * u];
}

function afterPoint(kick, target, zg, a) {
  const [x, y, z] = target;
  const side = x === 0 ? 1 : Math.sign(x);
  const bounce = (h) => Math.max(BALL_R, h);
  switch (kick.result) {
    case "goal": {
      const into = easeOut(clamp01(a / 0.4));
      const drop = clamp01((a - 0.3) / 0.7);
      return [x * (1 - 0.05 * into), bounce(lerp(y, BALL_R, drop ** 1.6) + 0.15 * Math.sin(Math.PI * drop)), lerp(z, zg + 1.45, into)];
    }
    case "save":
      return [x + side * 1.9 * easeOut(a), bounce(y + Math.sin(Math.PI * Math.min(1, a * 1.1)) * 1.1 - a * y * 0.9), z - 2.6 * easeOut(a)];
    case "post":
      return [x - side * 1.1 * easeOut(a), bounce(lerp(y, BALL_R, a) + Math.sin(Math.PI * a) * 0.7), z - 4.2 * easeOut(a)];
    case "bar":
      return [x * (1 + 0.1 * a), bounce(y + Math.sin(Math.PI * a) * 1.4 - a * (y - BALL_R)), z - 4.5 * easeOut(a)];
    case "over":
      return [x * (1 + 0.15 * a), y + 1.9 * easeOut(a), z + 4.4 * easeOut(a)];
    default:
      return [x * (1 + 0.35 * easeOut(a)), y + 0.3 * a, z + 4.4 * easeOut(a)];
  }
}

const RESULT_TEXT = {
  goal: { title: "GOAL!", tone: "goal" },
  save: { title: "SAVED!", tone: "save" },
  post: { title: "OFF THE POST!", tone: "miss" },
  bar: { title: "OFF THE BAR!", tone: "miss" },
  wide: { title: "WIDE!", tone: "miss" },
  over: { title: "OVER THE BAR!", tone: "miss" },
};

function resultLine(kick, shooterName, keeperName) {
  const s = surname(shooterName) ? shooterName.split(" ").slice(-1)[0] : "The shooter";
  const k = keeperName ? keeperName.split(" ").slice(-1)[0] : "The keeper";
  if (kick.late === "shot") return "Took too long: a rushed shot";
  if (kick.result === "goal") return kick.zone === "C" ? (kick.dive === "C" ? "Through him!" : `Down the middle, ${k} dived ${kick.dive === "L" ? "left" : "right"}`) : kick.dive === "C" ? `${k} stayed put` : `${s} sends ${k} the wrong way`;
  if (kick.result === "save") return `${k} read it`;
  if (kick.result === "post" || kick.result === "bar") return "So close!";
  return kick.yards >= 25 ? "From 25 yards out" : "It never troubled the keeper";
}

/* ---------- the scene ---------- */

export function PenaltyScene({ yards, script, shooter, keeper, shooterKit, keeperKit, className, style, children }) {
  const uid = useId().replace(/:/g, "");
  const [clockState, setClock] = useState({ key: "", t: 0 });
  const [aim, setAim] = useState({ x: 0, y: 0.32 });
  const [released, setReleased] = useState(null);
  const [hoverZone, setHoverZone] = useState(null);
  const box = useRef(null);
  const drag = useRef(null);
  const phase = useRef(Math.random() * 6);
  const doneRef = useRef(false);
  const releasedRef = useRef(null);
  const scriptKey = `${script.type}:${script.kick?.i ?? ""}:${script.from ?? ""}`;

  // One clock per script: restart it whenever what we're showing changes.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    doneRef.current = false;
    releasedRef.current = null;
    setReleased(null);
    setAim({ x: 0, y: 0.32 });
    phase.current = Math.random() * 6;
    const loop = (t) => {
      setClock({ key: scriptKey, t: t - t0 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scriptKey]);

  // A new script starts at zero on its very first frame (before the clock above has restarted).
  const clock = clockState.key === scriptKey ? clockState.t : 0;
  const zg = goalLine(yards);
  const sG = scaleAtGoal(yards);
  const now = performance.now();

  /* ----- the shooter ----- */
  const fromRunup = script.type === "aim" || (script.type === "replay" && script.from !== "strike");
  const runEnd = fromRunup ? RUN + BLEND : 0;
  let shooterRoot = SHOOTER_SPOT.start;
  let pose = STAND;
  let strikeT = null; // ms since the strike began
  const t = clock;
  if (script.type === "idle" || script.type === "keep") {
    pose = lerpPose(STAND, STAND, 0);
    const breathe = Math.sin(now / 420) * 0.01;
    pose = { ...pose, shL: [pose.shL[0], pose.shL[1] + breathe, 0], shR: [pose.shR[0], pose.shR[1] + breathe, 0], head: [0, 1.63 + breathe, 0], neck: [0, 1.5 + breathe, 0] };
  } else if (script.type === "frozen") {
    shooterRoot = SHOOTER_SPOT.plant;
    pose = kickPose(0);
  } else if (fromRunup && t < RUN) {
    const u = easeInOut(clamp01(t / RUN)) * 0.85 + clamp01(t / RUN) * 0.15;
    shooterRoot = [lerp(SHOOTER_SPOT.start[0], SHOOTER_SPOT.plant[0], u), lerp(SHOOTER_SPOT.start[1], SHOOTER_SPOT.plant[1], u)];
    pose = runPose(u * Math.PI * 2 * 2.4);
  } else if (fromRunup && t < runEnd) {
    shooterRoot = SHOOTER_SPOT.plant;
    pose = lerpPose(runPose(Math.PI * 2 * 2.4), plantPose(), easeOut((t - RUN) / BLEND));
  } else {
    shooterRoot = SHOOTER_SPOT.plant;
    if (script.type === "aim") pose = kickPose(0);
    else {
      strikeT = t - (fromRunup ? runEnd + PAUSE : 0);
      if (strikeT < 0) pose = kickPose(0);
      else pose = kickPose(strikeT < CONTACT_MS ? 0.45 * (strikeT / CONTACT_MS) : Math.min(1, 0.45 + (0.55 * (strikeT - CONTACT_MS)) / 230));
    }
  }
  const shooterJoints = {};
  for (const k in pose) shooterJoints[k] = [shooterRoot[0] + pose[k][0], pose[k][1], shooterRoot[1] + pose[k][2]];

  /* ----- the kick: ball and keeper ----- */
  let ball = [0, BALL_R, 0];
  let spin = 0;
  let ballOpacity = 1;
  let keeperJoints;
  let bulge = null;
  let shake = 0;
  let arrived = false;
  const keeperZ = zg - 0.28;
  const idleKeeper = () => {
    const lean = script.type === "keep" && (script.value || hoverZone) ? { L: -0.42, C: 0, R: 0.42 }[script.value || hoverZone] : 0;
    const bob = Math.abs(Math.sin(now / 260)) * 0.05;
    const shuffle = Math.sin(now / 900) * 0.14;
    return placeKeeper(KEEPER.ready, { tx: lean || shuffle, ty: bob - 0.04, theta: lean * 0.12 }, keeperZ);
  };
  if (script.type === "replay" && strikeT !== null && strikeT >= 0) {
    const k = script.kick;
    const { target, keeper: kp } = plan(k, yards);
    const flight = FLIGHT[yards];
    const ft = (strikeT - CONTACT_MS) / flight;
    if (ft >= 0 && ft <= 1) {
      const u = ft * (1.12 - 0.12 * ft);
      ball = flightPoint(target, yards, u);
      spin = ft * 900;
    } else if (ft > 1) {
      arrived = true;
      const a = clamp01(((ft - 1) * flight) / AFTER);
      ball = afterPoint(k, target, zg, a);
      spin = 900 + a * 500;
      if (["wide", "over"].includes(k.result)) ballOpacity = 1 - clamp01((a - 0.6) / 0.4);
      if (k.result === "goal") bulge = { X: target[0], Y: target[1], amt: 0.75 * Math.sin(Math.PI * clamp01(a / 0.55)) };
      if (k.result === "post" || k.result === "bar") shake = Math.max(0, 0.35 - a) * 3;
    }
    // the keeper goes as the ball is struck (he guessed before it was hit)
    const kt = clamp01((ft - 0.06) / 0.86);
    const e = easeOut(kt);
    const fall = clamp01(((ft - 1) * flight) / 420);
    const from = idleKeeper();
    const target3 = placeKeeper(KEEPER[kp.pose], { tx: kp.tx, ty: kp.ty + Math.sin(Math.PI * kt) * (kp.pose === "star" ? 0.1 : 0.22), theta: kp.theta }, keeperZ);
    keeperJoints = {};
    for (const j in target3) keeperJoints[j] = from[j].map((v, i) => lerp(v, target3[j][i], e));
    if (fall > 0 && kp.pose !== "ready" && kp.pose !== "star") {
      const down = placeKeeper(KEEPER[kp.pose], { tx: kp.tx + (kp.side ?? 0) * 0.25, ty: -0.62, theta: (kp.side ?? 1) * 1.5 }, keeperZ);
      for (const j in down) keeperJoints[j] = keeperJoints[j].map((v, i) => lerp(v, down[j][i], easeOut(fall)));
    } else if (fall > 0) {
      const land = placeKeeper(KEEPER.ready, { tx: kp.tx, ty: 0, theta: 0 }, keeperZ);
      for (const j in land) keeperJoints[j] = keeperJoints[j].map((v, i) => lerp(v, land[j][i], easeOut(fall)));
    }
  } else {
    keeperJoints = idleKeeper();
  }

  /* ----- aiming ----- */
  const aiming = script.type === "aim" && t >= runEnd && !released;
  const aimMs = Math.max(0, t - runEnd);
  const [sx, sy] = sway(aimMs, yards, phase.current);
  const shown = { x: clamp(aim.x + sx, -1.6, 1.6), y: clamp(aim.y + sy, 0.02, 1.6) };
  const release = () => {
    if (releasedRef.current || script.type !== "aim") return;
    const shot = { x: Math.round(shown.x * 1000) / 1000, y: Math.round(shown.y * 1000) / 1000 };
    releasedRef.current = shot;
    setReleased(shot);
    drag.current = null;
    script.onShoot?.(shot);
  };
  const aimExpired = aiming && aimMs > AIM_LIMIT;
  const replayOver = script.type === "replay" && strikeT !== null && strikeT > CONTACT_MS + FLIGHT[yards] + AFTER + HOLD;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const onDoneRef = useRef(script.onDone);
  onDoneRef.current = script.onDone;
  useEffect(() => {
    if (aimExpired) releaseRef.current();
  }, [aimExpired]);
  useEffect(() => {
    if (replayOver && !doneRef.current) {
      doneRef.current = true;
      onDoneRef.current?.();
    }
  }, [replayOver]);

  const toView = (e) => {
    const r = box.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const onDown = (e) => {
    if (script.type === "keep" && !script.locked) {
      const v = toView(e);
      const left = project(-GOAL.half, 0, zg).x;
      const right = project(GOAL.half, 0, zg).x;
      const f = (v.x - left) / (right - left);
      if (f < -0.25 || f > 1.25) return;
      script.onPick?.(f < 1 / 3 ? "L" : f > 2 / 3 ? "R" : "C");
      return;
    }
    if (script.type !== "aim" || releasedRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { start: toView(e), aim: { ...aim } };
  };
  const onMove = (e) => {
    if (script.type === "keep" && !script.locked && e.pointerType === "mouse") {
      const v = toView(e);
      const left = project(-GOAL.half, 0, zg).x;
      const right = project(GOAL.half, 0, zg).x;
      const f = (v.x - left) / (right - left);
      setHoverZone(f < -0.25 || f > 1.25 ? null : f < 1 / 3 ? "L" : f > 2 / 3 ? "R" : "C");
    }
    if (!drag.current) return;
    const v = toView(e);
    const dx = v.x - drag.current.start.x;
    const dy = v.y - drag.current.start.y;
    setAim({ x: clamp(drag.current.aim.x + (dx / (GOAL.half * sG)) * 0.85, -1.5, 1.5), y: clamp(drag.current.aim.y - (dy / (GOAL.height * sG)) * 0.6, 0, 1.5) });
  };
  const onUp = () => {
    if (drag.current && aiming) release();
  };

  /* ----- drawing ----- */
  const ballBehindKeeper = ball[2] > keeperZ + 0.05;
  const ballInNet = ball[2] > zg + 0.02;
  const showResult = script.type === "replay" && arrived;
  const resultInfo = showResult ? RESULT_TEXT[script.kick.result] : null;
  const ballPt = project(0, BALL_R, 0);
  const reticle = project(...goalPoint(shown.x, shown.y, yards));
  const onTarget = Math.abs(shown.x) < 0.94 && shown.y < 0.94;
  const nearFrame = !onTarget && Math.abs(shown.x) < 1.05 && shown.y < 1.05;
  const aimColor = onTarget ? "var(--color-signal)" : nearFrame ? "#fbbf24" : "#f43f5e";
  const ctrl = { x: (ballPt.x + reticle.x) / 2 + (reticle.x - ballPt.x) * 0.15, y: Math.min(ballPt.y, reticle.y) - 30 - (yards - 12) * 1.6 };
  const goalL = project(-GOAL.half, 0, zg);
  const goalR = project(GOAL.half, 0, zg);
  const goalTop = project(0, GOAL.height, zg).y;
  const stadium = useMemo(() => <Stadium yards={yards} uid={uid} />, [yards, uid]);

  return (
    <div
      ref={box}
      className={cn("relative overflow-hidden rounded-[26px] bg-[#05070d] ring-1 ring-white/10 select-none", (script.type === "aim" || script.type === "keep") && "touch-none", className)}
      style={{ aspectRatio: `${W} / ${H}`, ...style }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => (drag.current = null)}
      onPointerLeave={() => setHoverZone(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full">
        {stadium}
        <Net yards={yards} bulge={bulge} />
        {ballInNet && <Ball at={ball} spin={spin} opacity={ballOpacity} />}
        {/* the thirds the keeper picks from, while aiming or keeping */}
        {(aiming || script.type === "keep") && (
          <g>
            {[-1, -1 / 3, 1 / 3].map((x0, i) => {
              const a = project(...goalPoint(x0, 0, yards));
              const b = project(...goalPoint(x0 + 2 / 3, 1, yards));
              const zone = ["L", "C", "R"][i];
              const on = script.type === "keep" && (script.value === zone || (!script.value && hoverZone === zone));
              return <rect key={i} x={a.x} y={b.y} width={b.x - a.x} height={a.y - b.y} fill={on ? keeperKit.shirt : "#fff"} opacity={script.type === "keep" ? (on ? 0.32 : 0.06) : 0.035} stroke="#fff" strokeOpacity={script.type === "keep" ? 0.35 : 0.12} strokeDasharray="4 4" />;
            })}
          </g>
        )}
        <Frame yards={yards} shake={shake} />
        {!ballInNet && ballBehindKeeper && <Ball at={ball} spin={spin} opacity={ballOpacity} />}
        <Keeper joints={keeperJoints} kit={keeperKit} />
        {!ballInNet && !ballBehindKeeper && script.type !== "aim" && <Ball at={ball} spin={spin} opacity={ballOpacity} />}
        {script.type === "aim" && <Ball at={[0, BALL_R, 0]} />}
        <Shooter joints={shooterJoints} kit={shooterKit} name={shooter?.name ?? ""} root={shooterRoot} />

        {/* the direction line */}
        {aiming && (
          <g>
            <path d={`M${ballPt.x} ${ballPt.y} Q${ctrl.x} ${ctrl.y} ${reticle.x} ${reticle.y}`} fill="none" stroke={aimColor} strokeOpacity=".28" strokeWidth="9" strokeLinecap="round" />
            <path d={`M${ballPt.x} ${ballPt.y} Q${ctrl.x} ${ctrl.y} ${reticle.x} ${reticle.y}`} fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="1 9" className="so-march" />
            <circle cx={reticle.x} cy={reticle.y} r={0.34 * sG} fill={aimColor} fillOpacity=".16" stroke={aimColor} strokeWidth="2.2" />
            <circle cx={reticle.x} cy={reticle.y} r={0.34 * sG + 5} fill="none" stroke={aimColor} strokeOpacity=".45" strokeWidth="1" className="so-pulse" style={{ transformOrigin: `${reticle.x}px ${reticle.y}px` }} />
            <path d={`M${reticle.x - 0.5 * sG} ${reticle.y}h${0.3 * sG}M${reticle.x + 0.2 * sG} ${reticle.y}h${0.3 * sG}M${reticle.x} ${reticle.y - 0.5 * sG}v${0.3 * sG}M${reticle.x} ${reticle.y + 0.2 * sG}v${0.3 * sG}`} stroke={aimColor} strokeWidth="2" strokeLinecap="round" />
            <circle cx={reticle.x} cy={reticle.y} r="2.2" fill="#fff" />
          </g>
        )}
        {/* slow motion while aiming */}
        {aiming && <rect width={W} height={H} fill={`url(#${uid}vig)`} pointerEvents="none" />}
        <defs>
          <radialGradient id={`${uid}vig`} cx=".5" cy=".45" r=".75">
            <stop offset=".55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".55" />
          </radialGradient>
        </defs>
        {script.type === "keep" && (
          <g fontFamily="system-ui, sans-serif" fontSize="10" fontWeight="800" textAnchor="middle" letterSpacing=".08em">
            {["LEFT", "MIDDLE", "RIGHT"].map((label, i) => {
              const x = lerp(goalL.x, goalR.x, (i * 2 + 1) / 6);
              return (
                <text key={label} x={x} y={goalTop - 8} fill="#fff" opacity={script.value === ["L", "C", "R"][i] ? 1 : 0.6}>
                  {label}
                </text>
              );
            })}
          </g>
        )}
      </svg>

      {/* who's who */}
      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
        <span className="rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-white/90 uppercase ring-1 ring-white/10 backdrop-blur">
          {yards} yds · {DISTANCE_NAMES[yards]}
        </span>
        {keeper && <NameTag player={keeper} role="Keeper" color={keeperKit.shirt} />}
      </div>
      {shooter && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5">
          <NameTag player={shooter} role="Shooter" color={shooterKit.shirt} />
        </div>
      )}

      {/* aim hint and the aim clock */}
      {script.type === "aim" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-14 flex flex-col items-center gap-2">
          {aiming ? (
            <>
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur">Drag to aim · let go to shoot</span>
              <span className="h-1 w-28 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-signal" style={{ width: `${100 - clamp01(aimMs / AIM_LIMIT) * 100}%` }} />
              </span>
            </>
          ) : !released ? (
            <span className="rounded-full bg-black/50 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">Run-up…</span>
          ) : null}
        </div>
      )}

      {/* the result */}
      <AnimatePresence>
        {resultInfo && (
          <motion.div key={`r${script.kick.i}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18 }} className="pointer-events-none absolute inset-x-0 top-[20%] flex flex-col items-center text-center">
            <span
              className={cn(
                "font-display text-[clamp(38px,12vw,58px)] leading-none font-black tracking-tight italic drop-shadow-[0_6px_18px_rgba(0,0,0,.6)]",
                resultInfo.tone === "goal" ? "text-signal" : resultInfo.tone === "save" ? "text-white" : "text-rose-300",
              )}
              style={resultInfo.tone === "save" ? { color: keeperKit.shirt } : undefined}
            >
              {resultInfo.title}
            </span>
            <span className="mt-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{resultLine(script.kick, shooter?.name ?? "", keeper?.name ?? "")}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {resultInfo?.tone === "goal" && <Confetti key={script.kick.i} />}
      {children}
    </div>
  );
}

function NameTag({ player, role, color }) {
  return (
    <span className="flex items-center gap-2 rounded-2xl bg-black/60 py-1 pr-3 pl-1 ring-1 ring-white/10 backdrop-blur">
      <PlayerPhoto player={player} className="size-8 rounded-xl" ring={color} />
      <span className="min-w-0 leading-tight">
        <span className="block max-w-[7.5rem] truncate text-[12px] font-bold text-white">{player.name}</span>
        <span className="block font-mono text-[9px] tracking-wider text-white/60 uppercase">{role}</span>
      </span>
    </span>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 26 }, (_, i) => ({ x: (i * 37) % 100, d: (i % 7) * 0.05, r: ((i * 53) % 360) - 180, c: ["var(--color-signal)", "#fff", "#facc15", "#38bdf8", "#f472b6"][i % 5] })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <motion.span key={i} className="absolute top-[18%] h-2.5 w-1.5 rounded-sm" style={{ left: `${b.x}%`, background: b.c }} initial={{ y: -20, opacity: 0, rotate: 0 }} animate={{ y: [0, 220 + (i % 5) * 30], opacity: [1, 1, 0], rotate: b.r * 3, x: ((i % 2 ? 1 : -1) * ((i * 13) % 40)) }} transition={{ duration: 1.6, delay: b.d, ease: "easeOut" }} />
      ))}
    </div>
  );
}

/** Kits: yours in your theme colour, theirs in red; keepers in amber and cyan. */
export function kitsFor(isMe) {
  return isMe
    ? { shooter: { shirt: "var(--color-signal)", shorts: "#0b0b10", socks: "var(--color-signal)", number: "#0b0b10" }, keeper: { shirt: "#f59e0b", shorts: "#1f2937", socks: "#f59e0b", trim: "#b45309" } }
    : { shooter: { shirt: "#ef4444", shorts: "#f8fafc", socks: "#ef4444", number: "#fff" }, keeper: { shirt: "#22d3ee", shorts: "#0f172a", socks: "#22d3ee", trim: "#0e7490" } };
}

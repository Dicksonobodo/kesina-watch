import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import {
  BALL_R, CELEBRATE, clamp, clamp01, DESPAIR, DISTANCE_NAMES, divePlan, easeInOut, easeOut, GOAL, goalLine, goalPoint, H, KEEPER, kickPose, lerp, lerpPose,
  placeKeeper, plantPose, project, runPose, scaleAtGoal, SHOOTER_SPOT, shirtNumber, STAND, surname, sway, W,
} from "./geometry";
import { PlayerPhoto } from "./SquadPicker";

/*
 * The penalty, drawn from behind the shooter like Score Hero. What it shows is set by `script`:
 *
 *   { type: "idle" }                   the next taker waits behind the ball, the keeper bounces
 *   { type: "aim", onShoot }           run-up, then the pause to aim with the direction line; let go to shoot
 *   { type: "frozen" }                 your shot is struck and waiting for the keeper (live games)
 *   { type: "keep", value, onPick }    you're the keeper: swipe him left, right or up (the middle)
 *   { type: "replay", kick, from }     play a kick out ("runup" or straight from the "strike"), then onDone
 *
 * Two layers: the stadium (drawn once) and everything that moves. A "camera" (a CSS transform on
 * both) leans in while you aim and follows the ball to goal; the last part of the flight is in
 * slow motion.
 */

const RUN = 950;
const BLEND = 170;
const PAUSE = 140;
const CONTACT_MS = 110;
const FLIGHT = { 12: 520, 18: 650, 25: 790 };
const SLOW_AT = 0.72; // the last part of the flight plays slowly
const SLOW = 0.38;
const AFTER = 900;
const HOLD = 1150;
const AIM_LIMIT = 8000;
const realFlight = (yards) => FLIGHT[yards] * SLOW_AT + (FLIGHT[yards] * (1 - SLOW_AT)) / SLOW;
const flightAt = (ms, yards) => (ms <= FLIGHT[yards] * SLOW_AT ? ms / FLIGHT[yards] : SLOW_AT + ((ms - FLIGHT[yards] * SLOW_AT) / FLIGHT[yards]) * SLOW);

const SKIN = "#b47b52";
const SKIN_DARK = "#8f5c3a";
const HAIR = "#1b130c";
const OUT = "rgba(4,6,12,.62)";

/* ---------- drawing helpers ---------- */

/** A limb: a tapered capsule from a to b (screen points), radii in view units. */
function capsule(a, b, ra, rb) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 0.001;
  const nx = -dy / L;
  const ny = dx / L;
  return `M${a.x + nx * ra} ${a.y + ny * ra}L${b.x + nx * rb} ${b.y + ny * rb}A${rb} ${rb} 0 0 0 ${b.x - nx * rb} ${b.y - ny * rb}L${a.x - nx * ra} ${a.y - ny * ra}A${ra} ${ra} 0 0 0 ${a.x + nx * ra} ${a.y + ny * ra}Z`;
}
const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
function Seg({ a, b, ra, rb, fill, ow }) {
  return <path d={capsule(a, b, ra, rb ?? ra)} fill={fill} stroke={OUT} strokeWidth={ow} strokeLinejoin="round" />;
}

/* ---------- the stadium (drawn once per distance and screen shape) ---------- */

const Stadium = memo(function Stadium({ yards, uid, vb }) {
  const zBoards = goalLine(yards) + 4.6;
  const bTop = project(0, 0.95, zBoards).y;
  const bBottom = project(0, 0, zBoards).y;
  const X0 = vb.x - 20;
  const X1 = vb.x + vb.w + 20;
  const Y0 = vb.y - 20;
  const standTop = bTop - 150;
  const tiers = [standTop, standTop + 52, standTop + 102, bTop];
  const stripes = [];
  for (let z = -9; z < zBoards; z += 3) {
    const y1 = project(0, 0, z + 3).y;
    const y0 = Math.min(project(0, 0, z).y, vb.y + vb.h + 20);
    if (y0 <= bBottom) continue;
    stripes.push(<rect key={z} x={X0} y={Math.max(bBottom, y1)} width={X1 - X0} height={Math.max(0, y0 - Math.max(bBottom, y1))} fill={Math.round(z / 3) % 2 ? "#fff" : "#000"} opacity={Math.round(z / 3) % 2 ? 0.045 : 0.07} />);
  }
  const panels = [];
  const ads = [["DIXON WATCH", "var(--color-signal)", "#06120a"], ["MIND GAMES", "#0b1020", "#fff"], ["LIVE · AD-FREE", "#0b1020", "var(--color-signal)"], ["SHOOTOUT", "#e11d48", "#fff"]];
  for (let i = 0, x = X0 - 40; x < X1; x += 112, i++) {
    const [text, bg, fg] = ads[i % ads.length];
    panels.push(
      <g key={i}>
        <rect x={x} y={bTop} width="112" height={bBottom - bTop} fill={bg} />
        <text x={x + 56} y={(bTop + bBottom) / 2 + 3.8} textAnchor="middle" fontSize="10.5" fontWeight="900" fontStyle="italic" letterSpacing=".05em" fill={fg} fontFamily="system-ui, sans-serif">
          {text}
        </text>
        <rect x={x} y={bTop} width="1" height={bBottom - bTop} fill="#000" opacity=".5" />
      </g>,
    );
  }
  const goal = project(0, 0, goalLine(yards));
  const spot = project(0, 0, 0);
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="absolute inset-0 size-full" aria-hidden>
      <defs>
        <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#03050b" />
          <stop offset="1" stopColor="#0c1424" />
        </linearGradient>
        <pattern id={`${uid}crowd`} width="12" height="10" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="2" fill="#d6a882" />
          <rect x="0.8" y="4.8" width="4.4" height="5" rx="1.8" fill="#be123c" />
          <circle cx="9" cy="4" r="2" fill="#6b4329" />
          <rect x="6.8" y="5.8" width="4.4" height="4.2" rx="1.8" fill="#1d4ed8" />
        </pattern>
        <pattern id={`${uid}crowd2`} width="14" height="11" patternUnits="userSpaceOnUse" patternTransform="translate(6 5)">
          <circle cx="3.4" cy="3.2" r="2" fill="#f0c9a2" />
          <rect x="1.2" y="5" width="4.4" height="5.4" rx="1.8" fill="var(--color-signal)" />
          <circle cx="10.4" cy="2.6" r="1.9" fill="#4a2e1c" />
          <rect x="8.3" y="4.4" width="4.2" height="5.6" rx="1.8" fill="#f1f5f9" />
        </pattern>
        <filter id={`${uid}soft`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
        <filter id={`${uid}glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id={`${uid}tier`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".55" />
          <stop offset=".35" stopColor="#000" stopOpacity=".1" />
          <stop offset="1" stopColor="#000" stopOpacity=".3" />
        </linearGradient>
        <linearGradient id={`${uid}beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}pitch`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b6a33" />
          <stop offset=".5" stopColor="#23803d" />
          <stop offset="1" stopColor="#2c9447" />
        </linearGradient>
        <radialGradient id={`${uid}pool`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".13" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${uid}grass`} width="7" height="5" patternUnits="userSpaceOnUse">
          <rect x="1" y="1" width="1" height="2" fill="#0a3d1c" opacity=".35" />
          <rect x="4.5" y="2.5" width="1" height="2" fill="#7ee08f" opacity=".12" />
        </pattern>
        <linearGradient id={`${uid}led`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".35" />
        </linearGradient>
      </defs>

      {/* night sky and the roof */}
      <rect x={X0} y={Y0} width={X1 - X0} height={bTop - Y0} fill={`url(#${uid}sky)`} />
      <path d={`M${X0} ${standTop - 18} L${X1} ${standTop - 18} L${X1} ${standTop - 30} L${X0} ${standTop - 30} Z`} fill="#1a2233" />
      <rect x={X0} y={Y0} width={X1 - X0} height={standTop - 30 - Y0} fill="#04060c" />
      {/* floodlights along the roof, with their beams */}
      {Array.from({ length: 9 }).map((_, i) => {
        const x = X0 + ((i + 0.5) * (X1 - X0)) / 9;
        return (
          <g key={i}>
            <polygon points={`${x - 5},${standTop - 22} ${x + 5},${standTop - 22} ${x + 70},${bBottom} ${x - 70},${bBottom}`} fill={`url(#${uid}beam)`} opacity=".55" />
            <circle cx={x} cy={standTop - 24} r="9" fill="#fff" opacity=".35" filter={`url(#${uid}glow)`} />
            <rect x={x - 7} y={standTop - 27} width="14" height="5" rx="1.5" fill="#fffbe8" />
          </g>
        );
      })}
      {/* the stand: three tiers of fans, a little out of focus */}
      <g filter={`url(#${uid}soft)`}>
        <rect x={X0} y={standTop - 18} width={X1 - X0} height={bTop - standTop + 18} fill="#111827" />
        <rect x={X0} y={standTop} width={X1 - X0} height={bTop - standTop} fill={`url(#${uid}crowd)`} opacity=".62" />
        <rect x={X0} y={standTop} width={X1 - X0} height={bTop - standTop} fill={`url(#${uid}crowd2)`} opacity=".42" />
      </g>
      {tiers.slice(0, 3).map((y, i) => (
        <g key={i}>
          <rect x={X0} y={y} width={X1 - X0} height={tiers[i + 1] - y} fill={`url(#${uid}tier)`} />
          <rect x={X0} y={y - 2} width={X1 - X0} height="3" fill="#2a3346" />
          <rect x={X0} y={y + 1} width={X1 - X0} height="1" fill="#000" opacity=".5" />
        </g>
      ))}
      {/* banners over the front of the stand */}
      {[[-0.32, "DIXON"], [0.05, "ALLEZ"], [0.38, "WATCH"]].map(([f, t], i) => {
        const x = vb.x + vb.w * (0.5 + f) - 26; // on the middle tier, clear of the crossbar
        return (
          <g key={t}>
            <rect x={x} y={tiers[1] - 1} width="52" height="15" fill={i === 1 ? "#f8fafc" : "var(--color-signal)"} opacity=".92" />
            <text x={x + 26} y={tiers[1] + 10.5} textAnchor="middle" fontSize="9" fontWeight="900" fill="#0b0b10" fontFamily="system-ui, sans-serif">
              {t}
            </text>
          </g>
        );
      })}
      {/* camera flashes */}
      {Array.from({ length: 12 }).map((_, i) => (
        <circle key={i} cx={X0 + ((i * 131 + 47) % Math.round(X1 - X0))} cy={standTop + ((i * 53) % Math.round(bTop - standTop - 8))} r="1.8" fill="#fff" className="so-flash" style={{ animationDelay: `${(i * 0.61) % 4}s` }} />
      ))}
      {/* LED boards */}
      {panels}
      <rect x={X0} y={bTop} width={X1 - X0} height={bBottom - bTop} fill={`url(#${uid}led)`} />
      {/* the pitch */}
      <rect x={X0} y={bBottom} width={X1 - X0} height={vb.y + vb.h + 20 - bBottom} fill={`url(#${uid}pitch)`} />
      {stripes}
      <rect x={X0} y={bBottom} width={X1 - X0} height={vb.y + vb.h + 20 - bBottom} fill={`url(#${uid}grass)`} opacity=".55" />
      <ellipse cx={goal.x} cy={(goal.y + spot.y) / 2} rx={vb.w * 0.55} ry={(spot.y - goal.y) * 0.9} fill={`url(#${uid}pool)`} />
      {/* worn grass in the goalmouth and on the spot */}
      <ellipse cx={goal.x} cy={goal.y + 3 * (goal.s / 30)} rx={2.4 * goal.s} ry={0.5 * goal.s} fill="#6b5a2e" opacity=".22" />
      <ellipse cx={spot.x} cy={spot.y} rx={0.7 * spot.s} ry={0.2 * spot.s} fill="#6b5a2e" opacity=".22" />
      <PitchLines yards={yards} />
      {/* the goal's shadow on the grass */}
      <path d={(() => {
        const zg = goalLine(yards);
        const a = project(-GOAL.half, 0, zg);
        const b = project(-GOAL.half - 0.5, 0, zg + 1.6);
        const c = project(GOAL.half - 0.5, 0, zg + 1.6);
        const d = project(GOAL.half, 0, zg);
        return `M${a.x} ${a.y}L${b.x} ${b.y}L${c.x} ${c.y}L${d.x} ${d.y}Z`;
      })()} fill="#000" opacity=".16" />
    </svg>
  );
});

function PitchLines({ yards }) {
  const zg = goalLine(yards);
  const seg = (x1, z1, x2, z2, key) => {
    if (z1 < -8 && z2 < -8) return null;
    const a = project(x1, 0, Math.max(z1, -8));
    const b = project(x2, 0, Math.max(z2, -8));
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
    <g stroke="#f8fafc" strokeOpacity=".85" strokeWidth="1.7" fill="none" strokeLinecap="round">
      {seg(-60, zg, 60, zg, "gl")}
      {seg(-9.16, zg, -9.16, zg - 5.5, "6l")}
      {seg(9.16, zg, 9.16, zg - 5.5, "6r")}
      {seg(-9.16, zg - 5.5, 9.16, zg - 5.5, "6f")}
      {seg(-20.16, zg, -20.16, zg - 16.5, "bl")}
      {seg(20.16, zg, 20.16, zg - 16.5, "br")}
      {zg - 16.5 > -8 && seg(-20.16, zg - 16.5, 20.16, zg - 16.5, "bf")}
      {arc.length > 1 && <polyline points={arc.join(" ")} />}
      {yards !== 12 && <ellipse cx={spot.x} cy={spot.y} rx={0.11 * spot.s} ry={0.045 * spot.s} fill="#fff" fillOpacity=".9" stroke="none" />}
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
  for (let X = -half; X <= half + 0.01; X += half / 10) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(push(X, lerp(bottomBack[0], topBack[0], t), lerp(bottomBack[1], topBack[1], t)));
    }
    lines.push(poly(pts));
  }
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const pts = [];
    for (let X = -half; X <= half + 0.01; X += half / 6) pts.push(push(X, lerp(bottomBack[0], topBack[0], t), lerp(bottomBack[1], topBack[1], t)));
    lines.push(poly(pts));
  }
  for (let X = -half; X <= half + 0.01; X += half / 10) lines.push(poly([project(X, height, zg), push(X, topBack[0], topBack[1])]));
  for (let i = 1; i <= 2; i++) {
    const Z = lerp(zg, topBack[1], i / 3);
    lines.push(poly([project(-half, height, Z), project(half, height, Z)]));
  }
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
  const c = [project(-GOAL.half, 0, zg), project(-GOAL.half, GOAL.height, zg), project(GOAL.half, GOAL.height, zg), project(GOAL.half, 0, zg)];
  return (
    <g>
      <path d={`M${c.map((p) => `${p.x} ${p.y}`).join(" L")} Z`} fill="#020a05" fillOpacity=".42" />
      <g stroke="#fff" strokeOpacity=".42" strokeWidth=".75" fill="none">
        {lines.map((points, i) => (
          <polyline key={i} points={points} />
        ))}
      </g>
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
  const w = 0.13 * a.s;
  const path = `M${a.x} ${a.y} L${b.x} ${b.y} L${c.x} ${c.y} L${d.x} ${d.y}`;
  return (
    <g transform={shake ? `translate(${Math.sin(shake * 70) * shake * 2.4} 0)` : undefined}>
      <path d={path} fill="none" stroke="#000" strokeOpacity=".35" strokeWidth={w + 2} strokeLinejoin="round" />
      <path d={path} fill="none" stroke="#f1f5f9" strokeWidth={w} strokeLinejoin="round" />
      <path d={`M${a.x - w * 0.22} ${a.y} L${b.x - w * 0.22} ${b.y - w * 0.22} L${c.x + w * 0.22} ${c.y - w * 0.22} L${d.x + w * 0.22} ${d.y}`} fill="none" stroke="#fff" strokeWidth={w * 0.28} strokeLinejoin="round" />
      <path d={`M${a.x + w * 0.25} ${a.y} L${b.x + w * 0.25} ${b.y + w * 0.25} L${c.x - w * 0.25} ${c.y + w * 0.25} L${d.x - w * 0.25} ${d.y}`} fill="none" stroke="#94a3b8" strokeWidth={w * 0.22} strokeLinejoin="round" opacity=".8" />
    </g>
  );
}

/* ---------- people ---------- */

/** The shooter from behind: shaped shirt with name and number, shorts, socks, boots. Joints in world metres. */
function Shooter({ joints, kit, name, root, uid }) {
  const p = {};
  for (const k in joints) p[k] = project(...joints[k]);
  const s = project(root[0], 0, root[1]).s;
  const ow = Math.max(0.8, 0.016 * s);
  const ground = project(root[0], 0, root[1] + 0.05);
  const legs = ["L", "R"].sort((x, y) => joints[`foot${y}`][2] - joints[`foot${x}`][2]); // the far leg first
  const out = (q, by) => ({ x: q.x + by, y: q.y });
  const shL = out(p.shL, -0.04 * s);
  const shR = out(p.shR, 0.04 * s);
  const hpL = { x: p.hipL.x - 0.045 * s, y: p.hipL.y + 0.05 * s };
  const hpR = { x: p.hipR.x + 0.045 * s, y: p.hipR.y + 0.05 * s };
  const neckBase = mix(shL, shR, 0.5);
  const torso = `M${shL.x} ${shL.y + 0.03 * s} Q${neckBase.x} ${neckBase.y - 0.05 * s} ${shR.x} ${shR.y + 0.03 * s} L${hpR.x} ${hpR.y} Q${(hpL.x + hpR.x) / 2} ${(hpL.y + hpR.y) / 2 + 0.03 * s} ${hpL.x} ${hpL.y} Z`;
  const centre = { x: (shL.x + shR.x + hpL.x + hpR.x) / 4, y: (shL.y + shR.y + hpL.y + hpR.y) / 4 };
  return (
    <g>
      <ellipse cx={ground.x} cy={ground.y} rx={0.42 * s} ry={0.1 * s} fill="#000" opacity=".3" />
      {legs.map((side) => {
        const hip = p[`hip${side}`];
        const knee = p[`knee${side}`];
        const foot = p[`foot${side}`];
        const ankle = mix(knee, foot, 0.86);
        const j = joints[`foot${side}`];
        const tip = project(j[0], j[1], j[2] + 0.17);
        return (
          <g key={side}>
            <Seg a={hip} b={knee} ra={0.085 * s} rb={0.062 * s} fill={SKIN} ow={ow} />
            <Seg a={knee} b={ankle} ra={0.062 * s} rb={0.043 * s} fill={kit.socks} ow={ow} />
            <path d={capsule(mix(knee, ankle, 0.08), mix(knee, ankle, 0.2), 0.061 * s, 0.058 * s)} fill="#fff" opacity=".5" />
            <Seg a={ankle} b={tip} ra={0.05 * s} rb={0.042 * s} fill="#0d0f14" ow={ow} />
            <path d={capsule(mix(ankle, tip, 0.25), mix(ankle, tip, 0.8), 0.016 * s, 0.014 * s)} fill="#f8fafc" opacity=".85" />
            <Seg a={hip} b={mix(hip, knee, 0.45)} ra={0.1 * s} rb={0.09 * s} fill={kit.shorts} ow={ow} />
          </g>
        );
      })}
      <Seg a={p.hipL} b={p.hipR} ra={0.09 * s} fill={kit.shorts} ow={ow} />
      {/* the shirt */}
      <path d={torso} fill={kit.shirt} stroke={OUT} strokeWidth={ow} strokeLinejoin="round" />
      <path d={torso} fill={`url(#${uid}shadeX)`} />
      <path d={`M${neckBase.x - 0.07 * s} ${neckBase.y - 0.015 * s} Q${neckBase.x} ${neckBase.y + 0.035 * s} ${neckBase.x + 0.07 * s} ${neckBase.y - 0.015 * s}`} fill="none" stroke={kit.trim ?? "#0b0b10"} strokeWidth={0.025 * s} strokeLinecap="round" />
      <text x={centre.x} y={centre.y - 0.14 * s} textAnchor="middle" fontSize={0.075 * s} fontWeight="900" fill={kit.number} fontFamily="system-ui, sans-serif" letterSpacing=".05em">
        {surname(name)}
      </text>
      <text x={centre.x} y={centre.y + 0.12 * s} textAnchor="middle" fontSize={0.27 * s} fontWeight="900" fill={kit.number} fontFamily="system-ui, sans-serif" stroke={OUT} strokeWidth={0.006 * s} paintOrder="stroke">
        {shirtNumber(name)}
      </text>
      {/* arms: short sleeves, then skin */}
      {["L", "R"].map((side) => {
        const sh = side === "L" ? shL : shR;
        const el = p[`el${side}`];
        const hand = p[`hand${side}`];
        return (
          <g key={side}>
            <Seg a={mix(sh, el, 0.5)} b={el} ra={0.048 * s} rb={0.044 * s} fill={SKIN} ow={ow} />
            <Seg a={el} b={hand} ra={0.044 * s} rb={0.036 * s} fill={SKIN} ow={ow} />
            <circle cx={hand.x} cy={hand.y} r={0.045 * s} fill={SKIN_DARK} stroke={OUT} strokeWidth={ow} />
            <Seg a={sh} b={mix(sh, el, 0.62)} ra={0.07 * s} rb={0.06 * s} fill={kit.shirt} ow={ow} />
          </g>
        );
      })}
      {/* head from behind */}
      <Seg a={p.neck} b={mix(p.neck, p.head, 0.6)} ra={0.052 * s} fill={SKIN_DARK} ow={ow} />
      <ellipse cx={p.head.x - 0.105 * s} cy={p.head.y + 0.015 * s} rx={0.025 * s} ry={0.035 * s} fill={SKIN} stroke={OUT} strokeWidth={ow} />
      <ellipse cx={p.head.x + 0.105 * s} cy={p.head.y + 0.015 * s} rx={0.025 * s} ry={0.035 * s} fill={SKIN} stroke={OUT} strokeWidth={ow} />
      <ellipse cx={p.head.x} cy={p.head.y} rx={0.11 * s} ry={0.125 * s} fill={HAIR} stroke={OUT} strokeWidth={ow} />
      <path d={`M${p.head.x - 0.06 * s} ${p.head.y - 0.08 * s} Q${p.head.x} ${p.head.y - 0.12 * s} ${p.head.x + 0.05 * s} ${p.head.y - 0.085 * s}`} fill="none" stroke="#fff" strokeOpacity=".16" strokeWidth={0.02 * s} strokeLinecap="round" />
    </g>
  );
}

/** The keeper, facing us: long-sleeved kit with a chest band, big gloves. */
function Keeper({ joints, kit, uid }) {
  const p = {};
  for (const k in joints) p[k] = project(...joints[k]);
  const s = project(0, 0, joints.hipL[2]).s;
  const ow = Math.max(0.7, 0.018 * s);
  const ground = project((joints.footL[0] + joints.footR[0]) / 2, 0, joints.hipL[2]);
  const lift = Math.max(0, Math.min(joints.footL[1], joints.footR[1], joints.hipL[1] - 0.45));
  const shL = { x: p.shL.x - 0.03 * s, y: p.shL.y };
  const shR = { x: p.shR.x + 0.03 * s, y: p.shR.y };
  const torso = `M${shL.x} ${shL.y} L${shR.x} ${shR.y} L${p.hipR.x + 0.035 * s} ${p.hipR.y} L${p.hipL.x - 0.035 * s} ${p.hipL.y} Z`;
  const band = [mix(shL, p.hipL, 0.32), mix(shR, p.hipR, 0.32), mix(shR, p.hipR, 0.45), mix(shL, p.hipL, 0.45)];
  const head = p.head;
  return (
    <g>
      <ellipse cx={ground.x} cy={ground.y} rx={0.55 * s} ry={0.09 * s} fill="#000" opacity={0.32 * clamp01(1 - lift)} />
      {["L", "R"].map((side) => {
        const knee = p[`knee${side}`];
        const foot = p[`foot${side}`];
        const ankle = mix(knee, foot, 0.85);
        const j = joints[`foot${side}`];
        const tip = project(j[0], j[1] - 0.02, j[2] - 0.14);
        return (
          <g key={side}>
            <Seg a={p[`hip${side}`]} b={knee} ra={0.08 * s} rb={0.06 * s} fill={SKIN} ow={ow} />
            <Seg a={knee} b={ankle} ra={0.06 * s} rb={0.044 * s} fill={kit.socks} ow={ow} />
            <Seg a={ankle} b={tip} ra={0.048 * s} rb={0.044 * s} fill="#0d0f14" ow={ow} />
            <Seg a={p[`hip${side}`]} b={mix(p[`hip${side}`], knee, 0.42)} ra={0.098 * s} rb={0.088 * s} fill={kit.shorts} ow={ow} />
          </g>
        );
      })}
      <Seg a={p.hipL} b={p.hipR} ra={0.085 * s} fill={kit.shorts} ow={ow} />
      <path d={torso} fill={kit.shirt} stroke={OUT} strokeWidth={ow} strokeLinejoin="round" />
      <path d={`M${band.map((q) => `${q.x} ${q.y}`).join(" L")} Z`} fill="#000" opacity=".22" />
      <path d={torso} fill={`url(#${uid}shadeX)`} />
      {["L", "R"].map((side) => {
        const sh = side === "L" ? shL : shR;
        const el = p[`el${side}`];
        const hand = p[`hand${side}`];
        return (
          <g key={side}>
            <Seg a={sh} b={el} ra={0.062 * s} rb={0.054 * s} fill={kit.shirt} ow={ow} />
            <Seg a={el} b={mix(el, hand, 0.78)} ra={0.054 * s} rb={0.048 * s} fill={kit.shirt} ow={ow} />
            <circle cx={hand.x} cy={hand.y} r={0.085 * s} fill="#f8fafc" stroke={OUT} strokeWidth={ow} />
            <path d={capsule(mix(el, hand, 0.7), mix(el, hand, 0.82), 0.06 * s, 0.06 * s)} fill={kit.trim} />
          </g>
        );
      })}
      <Seg a={p.neck} b={mix(p.neck, head, 0.5)} ra={0.05 * s} fill={SKIN_DARK} ow={ow} />
      <ellipse cx={head.x} cy={head.y} rx={0.1 * s} ry={0.12 * s} fill={SKIN} stroke={OUT} strokeWidth={ow} />
      <path d={`M${head.x - 0.105 * s} ${head.y - 0.005 * s} Q${head.x - 0.1 * s} ${head.y - 0.15 * s} ${head.x} ${head.y - 0.13 * s} Q${head.x + 0.1 * s} ${head.y - 0.15 * s} ${head.x + 0.105 * s} ${head.y - 0.005 * s} Q${head.x} ${head.y - 0.07 * s} ${head.x - 0.105 * s} ${head.y - 0.005 * s} Z`} fill={HAIR} />
      <circle cx={head.x - 0.035 * s} cy={head.y + 0.01 * s} r={0.012 * s} fill="#111" />
      <circle cx={head.x + 0.035 * s} cy={head.y + 0.01 * s} r={0.012 * s} fill="#111" />
    </g>
  );
}

function Ball({ at, spin = 0, opacity = 1, uid }) {
  const p = project(...at);
  const g = project(at[0], 0, at[2]);
  const r = Math.max(2.2, BALL_R * p.s * 1.15);
  const lift = clamp01((at[1] - BALL_R) / 2.5);
  return (
    <g opacity={opacity}>
      <ellipse cx={g.x} cy={g.y} rx={r * (1.05 - lift * 0.4)} ry={r * 0.3 * (1.05 - lift * 0.4)} fill="#000" opacity={0.38 * (1 - lift * 0.7)} />
      <g transform={`translate(${p.x} ${p.y})`}>
        <circle r={r} fill={`url(#${uid}ball)`} stroke="#334155" strokeWidth={r * 0.06} />
        <g transform={`rotate(${spin})`}>
          <path d={`M0 ${-r * 0.4} L${r * 0.38} ${-r * 0.12} L${r * 0.24} ${r * 0.32} L${-r * 0.24} ${r * 0.32} L${-r * 0.38} ${-r * 0.12} Z`} fill="#0f172a" />
          <path d={`M${-r * 0.92} ${-r * 0.32} l${r * 0.36} ${r * 0.06} M${r * 0.92} ${-r * 0.32} l${-r * 0.36} ${r * 0.06} M0 ${r * 0.94} l0 ${-r * 0.36}`} stroke="#0f172a" strokeWidth={r * 0.13} />
        </g>
        <ellipse cx={-r * 0.32} cy={-r * 0.38} rx={r * 0.3} ry={r * 0.2} fill="#fff" opacity=".6" />
      </g>
    </g>
  );
}

/* ---------- what happens on a kick ---------- */

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
    const towardsBall = saved || (kick.zone === kick.dive && kick.result !== "goal");
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
      const into = easeOut(clamp01(a / 0.35));
      const drop = clamp01((a - 0.25) / 0.6);
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
  const s = shooterName ? shooterName.split(" ").slice(-1)[0] : "The shooter";
  const k = keeperName ? keeperName.split(" ").slice(-1)[0] : "The keeper";
  if (kick.late === "shot") return "Took too long: a rushed shot";
  if (kick.result === "goal") return kick.zone === "C" ? (kick.dive === "C" ? "Straight through him!" : `Down the middle, ${k} dived ${kick.dive === "L" ? "left" : "right"}`) : kick.dive === "C" ? `${k} stayed put` : `${s} sends ${k} the wrong way`;
  if (kick.result === "save") return `${k} read it`;
  if (kick.result === "post" || kick.result === "bar") return "So close!";
  return kick.yards >= 25 ? "From 25 yards out" : "It never troubled the keeper";
}

/** The visible part of the scene for this box: the same picture, more stand and pitch on a tall screen. */
function viewBoxFor(w, h) {
  const aspect = w > 0 && h > 0 ? w / h : W / H;
  if (aspect >= W / H) {
    const vw = H * aspect;
    return { x: (W - vw) / 2, y: 0, w: vw, h: H };
  }
  const vh = Math.min(W / aspect, H * 1.32);
  const vw = vh * aspect;
  const extra = vh - H;
  return { x: (W - vw) / 2, y: -extra * 0.62, w: vw, h: vh };
}

/* ---------- the scene ---------- */

export function PenaltyScene({ yards, script, shooter, keeper, shooterKit, keeperKit, className, style, children }) {
  const uid = useId().replace(/:/g, "");
  const [clockState, setClock] = useState({ key: "", t: 0 });
  const [aim, setAim] = useState({ x: 0, y: 0.32 });
  const [released, setReleased] = useState(null);
  const [swipe, setSwipe] = useState(null); // keeper being swiped: { dx, dy } in view units
  const [nudge, setNudge] = useState(0); // a swipe that was too small: show the hint again
  const [box, setBox] = useState({ w: 0, h: 0 });
  const boxRef = useRef(null);
  const fg = useRef(null);
  const drag = useRef(null);
  const phase = useRef(Math.random() * 6);
  const doneRef = useRef(false);
  const releasedRef = useRef(null);
  const scriptKey = `${script.type}:${script.kick?.i ?? ""}:${script.from ?? ""}`;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One clock per script: restart it whenever what we're showing changes.
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    doneRef.current = false;
    releasedRef.current = null;
    drag.current = null;
    setReleased(null);
    setSwipe(null);
    setAim({ x: 0, y: 0.32 });
    phase.current = Math.random() * 6;
    const loop = (t) => {
      setClock({ key: scriptKey, t: t - t0 });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scriptKey]);

  const vb = useMemo(() => viewBoxFor(box.w, box.h), [box.w, box.h]);
  const clock = clockState.key === scriptKey ? clockState.t : 0; // a new script starts at zero on its first frame
  const zg = goalLine(yards);
  const sG = scaleAtGoal(yards);
  const now = performance.now();
  const t = clock;
  const keepMode = script.type === "keep" && !script.locked && !script.value;

  /* ----- the shooter ----- */
  const fromRunup = script.type === "aim" || (script.type === "replay" && script.from !== "strike");
  const runEnd = fromRunup ? RUN + BLEND : 0;
  let shooterRoot = SHOOTER_SPOT.start;
  let pose = STAND;
  let hop = 0;
  let strikeT = null;
  if (script.type === "idle" || script.type === "keep") {
    const breathe = Math.sin(now / 420) * 0.012;
    const bounce = Math.abs(Math.sin(now / 330)) * 0.02;
    pose = Object.fromEntries(Object.entries(STAND).map(([k, v]) => [k, [v[0], v[1] + (k.startsWith("foot") ? 0 : breathe + bounce), v[2] ?? 0]]));
  } else if (script.type === "frozen") {
    shooterRoot = SHOOTER_SPOT.plant;
    pose = kickPose(0);
  } else if (fromRunup && t < RUN) {
    const u = easeInOut(clamp01(t / RUN)) * 0.85 + clamp01(t / RUN) * 0.15;
    shooterRoot = [lerp(SHOOTER_SPOT.start[0], SHOOTER_SPOT.plant[0], u), lerp(SHOOTER_SPOT.start[1], SHOOTER_SPOT.plant[1], u)];
    pose = runPose(u * Math.PI * 2 * 2);
  } else if (fromRunup && t < runEnd) {
    shooterRoot = SHOOTER_SPOT.plant;
    pose = lerpPose(runPose(Math.PI * 2 * 2), plantPose(), easeOut((t - RUN) / BLEND));
  } else {
    shooterRoot = SHOOTER_SPOT.plant;
    if (script.type === "aim") pose = kickPose(0);
    else {
      strikeT = t - (fromRunup ? runEnd + PAUSE : 0);
      if (strikeT < 0) pose = kickPose(0);
      else pose = kickPose(strikeT < CONTACT_MS ? 0.45 * (strikeT / CONTACT_MS) : Math.min(1, 0.45 + (0.55 * (strikeT - CONTACT_MS)) / 230));
      // after the ball arrives: arms up for a goal, hands on head for anything else
      const sinceArrival = strikeT - CONTACT_MS - realFlight(yards);
      if (sinceArrival > 250) {
        const k = easeOut(clamp01((sinceArrival - 250) / 420));
        pose = lerpPose(pose, script.kick.result === "goal" ? CELEBRATE : DESPAIR, k);
        if (script.kick.result === "goal") hop = Math.abs(Math.sin((sinceArrival - 250) / 170)) * 0.12 * k;
      }
    }
  }
  const shooterJoints = {};
  for (const k in pose) shooterJoints[k] = [shooterRoot[0] + pose[k][0], pose[k][1] + hop, shooterRoot[1] + (pose[k][2] ?? 0)];

  /* ----- the kick: ball, keeper, camera ----- */
  let ball = [0, BALL_R, 0];
  let spin = 0;
  let ballOpacity = 1;
  let keeperJoints;
  let bulge = null;
  let shake = 0;
  let arrived = false;
  let trail = [];
  let flash = 0;
  let flashAt = null;
  const goalMid = project(0, GOAL.height * 0.45, zg);
  const cam = { z: 1, x: goalMid.x, y: goalMid.y, jx: 0, jy: 0 };
  const keeperZ = zg - 0.28;
  const idleKeeper = () => {
    const chosen = script.type === "keep" ? script.value : null;
    if (chosen) {
      // loaded up, ready to go that way
      const side = { L: -1, C: 0, R: 1 }[chosen];
      return placeKeeper(side ? KEEPER[side < 0 ? "left" : "right"] : KEEPER.ready, { tx: side * 0.35, ty: side ? -0.22 : -0.08, theta: side * 0.32 }, keeperZ);
    }
    if (swipe) {
      const f = clamp(swipe.dx / 70, -1, 1);
      const up = clamp(-swipe.dy / 70, 0, 1);
      const base = placeKeeper(KEEPER.ready, { tx: f * 0.55, ty: up * 0.2, theta: f * 0.42 }, keeperZ);
      const star = placeKeeper(KEEPER.star, { tx: f * 0.55, ty: up * 0.2, theta: f * 0.42 }, keeperZ);
      for (const j in base) base[j] = base[j].map((v, i) => lerp(v, star[j][i], up * (1 - Math.abs(f))));
      return base;
    }
    const shuffle = Math.sin(now / 700) * 0.16;
    const bob = Math.max(0, Math.sin(now / 210)) * 0.045;
    return placeKeeper(KEEPER.ready, { tx: shuffle, ty: bob - 0.05, theta: Math.sin(now / 700) * 0.04 }, keeperZ);
  };
  if (script.type === "replay" && strikeT !== null && strikeT >= 0) {
    const k = script.kick;
    const { target, keeper: kp } = plan(k, yards);
    const real = realFlight(yards);
    const r = strikeT - CONTACT_MS;
    const ft = r < 0 ? -1 : r <= real ? flightAt(r, yards) : 1 + (r - real) / FLIGHT[yards];
    if (ft >= 0 && ft <= 1) {
      const u = ft * (1.12 - 0.12 * ft);
      ball = flightPoint(target, yards, u);
      spin = ft * 900;
      trail = [1, 2, 3, 4, 5].map((n) => ft - n * 0.035).filter((f) => f > 0).map((f) => flightPoint(target, yards, f * (1.12 - 0.12 * f)));
    } else if (ft > 1) {
      arrived = true;
      const a = clamp01((r - real) / AFTER);
      ball = afterPoint(k, target, zg, a);
      spin = 900 + a * 500;
      if (["wide", "over"].includes(k.result)) ballOpacity = 1 - clamp01((a - 0.6) / 0.4);
      if (k.result === "goal") {
        bulge = { X: target[0], Y: target[1], amt: 0.8 * Math.sin(Math.PI * clamp01(a / 0.5)) };
        flash = Math.max(0, 1 - a * 4);
        flashAt = project(...target);
      }
      if (k.result === "post" || k.result === "bar") shake = Math.max(0, 0.35 - a) * 3;
    }
    // the keeper goes as the ball is struck (he guessed before it was hit)
    const kt = clamp01((ft - 0.06) / 0.86);
    const e = easeOut(kt);
    const fall = clamp01((r - real) / 420);
    const from = placeKeeper(KEEPER.ready, { tx: 0, ty: -0.05, theta: 0 }, keeperZ);
    const to = placeKeeper(KEEPER[kp.pose], { tx: kp.tx, ty: kp.ty + Math.sin(Math.PI * kt) * (kp.pose === "star" ? 0.1 : 0.22), theta: kp.theta }, keeperZ);
    keeperJoints = {};
    for (const j in to) keeperJoints[j] = from[j].map((v, i) => lerp(v, to[j][i], e));
    if (fall > 0 && kp.pose !== "ready" && kp.pose !== "star") {
      const down = placeKeeper(KEEPER[kp.pose], { tx: kp.tx + (kp.side ?? 0) * 0.25, ty: -0.62, theta: (kp.side ?? 1) * 1.5 }, keeperZ);
      for (const j in down) keeperJoints[j] = keeperJoints[j].map((v, i) => lerp(v, down[j][i], easeOut(fall)));
    } else if (fall > 0) {
      const land = placeKeeper(KEEPER.ready, { tx: kp.tx, ty: 0, theta: 0 }, keeperZ);
      for (const j in land) keeperJoints[j] = keeperJoints[j].map((v, i) => lerp(v, land[j][i], easeOut(fall)));
    }
    // camera: follow the ball in, settle on the goal; a jolt when it hits the net
    const tgt = project(...target);
    const prog = easeInOut(clamp01(r / real));
    cam.z = lerp(script.from === "strike" ? 1.1 : 1, 1.4, prog);
    cam.x = lerp(goalMid.x, tgt.x, 0.55 * prog);
    cam.y = lerp(goalMid.y, tgt.y, 0.4 * prog);
    if (k.result === "goal" && arrived) {
      const j = Math.max(0, 1 - (r - real) / 380);
      cam.jx = Math.sin(r / 18) * 4 * j;
      cam.jy = Math.cos(r / 23) * 3 * j;
    }
  } else {
    keeperJoints = idleKeeper();
  }

  /* ----- aiming ----- */
  const aiming = script.type === "aim" && t >= runEnd && !released;
  const aimMs = Math.max(0, t - runEnd);
  if (script.type === "aim" && t >= runEnd) cam.z = 1 + 0.12 * easeOut(clamp01(aimMs / 650));
  if (script.type === "frozen" || script.type === "keep") cam.z = 1.12;
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
  const replayOver = script.type === "replay" && strikeT !== null && strikeT > CONTACT_MS + realFlight(yards) + AFTER + HOLD;
  const releaseRef = useRef(release);
  releaseRef.current = release;
  const onDoneRef = useRef(script.onDone);
  onDoneRef.current = script.onDone;
  const pickRef = useRef(null);
  pickRef.current = keepMode ? script.onPick : null;
  useEffect(() => {
    if (aimExpired) releaseRef.current();
  }, [aimExpired]);
  useEffect(() => {
    if (replayOver && !doneRef.current) {
      doneRef.current = true;
      onDoneRef.current?.();
    }
  }, [replayOver]);
  // Arrow keys work for the keeper too.
  useEffect(() => {
    if (!keepMode) return;
    const onKey = (e) => {
      const zone = { ArrowLeft: "L", ArrowRight: "R", ArrowUp: "C" }[e.key];
      if (zone) {
        e.preventDefault();
        pickRef.current?.(zone);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keepMode]);

  const toView = (e) => {
    const m = fg.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  };
  const onDown = (e) => {
    if (keepMode) {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { kind: "keep", start: toView(e) };
      setSwipe({ dx: 0, dy: 0 });
      return;
    }
    if (script.type !== "aim" || releasedRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { kind: "aim", start: toView(e), aim: { ...aim } };
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const v = toView(e);
    const dx = v.x - drag.current.start.x;
    const dy = v.y - drag.current.start.y;
    if (drag.current.kind === "keep") setSwipe({ dx, dy });
    else setAim({ x: clamp(drag.current.aim.x + (dx / (GOAL.half * sG)) * 0.85, -1.5, 1.5), y: clamp(drag.current.aim.y - (dy / (GOAL.height * sG)) * 0.6, 0, 1.5) });
  };
  const onUp = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "keep") {
      const v = toView(e);
      const dx = v.x - d.start.x;
      const dy = v.y - d.start.y;
      drag.current = null;
      setSwipe(null);
      const zone = Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy) * 0.7 ? (dx < 0 ? "L" : "R") : dy < -26 ? "C" : null;
      if (zone) script.onPick?.(zone);
      else setNudge((n) => n + 1);
      return;
    }
    if (aiming) release();
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
  const keeperHead = project(...keeperJoints.head);
  const pct = (q) => ({ left: `${((q.x - vb.x) / vb.w) * 100}%`, top: `${((q.y - vb.y) / vb.h) * 100}%` });
  const origin = pct({ x: cam.x, y: cam.y });
  const slowMo = aiming || script.type === "keep" || script.type === "frozen";

  return (
    <div
      ref={boxRef}
      className={cn("relative overflow-hidden bg-[#05070d] select-none", (script.type === "aim" || keepMode) && "touch-none", className)}
      style={style}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => {
        drag.current = null;
        setSwipe(null);
      }}
    >
      {/* the camera */}
      <div className="absolute inset-0 will-change-transform" style={{ transformOrigin: `${origin.left} ${origin.top}`, transform: `translate(${cam.jx}px, ${cam.jy}px) scale(${cam.z})` }}>
        <div className="absolute inset-0 transition-[filter] duration-500" style={{ filter: slowMo ? "saturate(.7) brightness(.78)" : "none" }}>
          <Stadium yards={yards} uid={uid} vb={vb} />
        </div>
        <svg ref={fg} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="absolute inset-0 size-full">
          <defs>
            <linearGradient id={`${uid}shadeX`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#000" stopOpacity=".32" />
              <stop offset=".35" stopColor="#000" stopOpacity="0" />
              <stop offset=".65" stopColor="#fff" stopOpacity=".1" />
              <stop offset="1" stopColor="#000" stopOpacity=".28" />
            </linearGradient>
            <radialGradient id={`${uid}ball`} cx=".38" cy=".32" r=".75">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".7" stopColor="#e2e8f0" />
              <stop offset="1" stopColor="#94a3b8" />
            </radialGradient>
            <radialGradient id={`${uid}vig`} cx=".5" cy=".45" r=".75">
              <stop offset=".55" stopColor="#000" stopOpacity="0" />
              <stop offset="1" stopColor="#000" stopOpacity=".6" />
            </radialGradient>
            <radialGradient id={`${uid}flash`} cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#fff" stopOpacity=".9" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <marker id={`${uid}arrow`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={keeperKit.shirt} />
            </marker>
          </defs>
          <Net yards={yards} bulge={bulge} />
          {ballInNet && <Ball at={ball} spin={spin} opacity={ballOpacity} uid={uid} />}
          {/* the thirds, faintly, while aiming */}
          {aiming &&
            [-1 / 3, 1 / 3].map((x0) => {
              const a = project(...goalPoint(x0, 0, yards));
              const b = project(...goalPoint(x0, 1, yards));
              return <line key={x0} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeOpacity=".22" strokeDasharray="3 5" />;
            })}
          <Frame yards={yards} shake={shake} />
          {flash > 0 && flashAt && <circle cx={flashAt.x} cy={flashAt.y} r={40 + (1 - flash) * 60} fill={`url(#${uid}flash)`} opacity={flash} />}
          {!ballInNet && ballBehindKeeper && <Ball at={ball} spin={spin} opacity={ballOpacity} uid={uid} />}
          <Keeper joints={keeperJoints} kit={keeperKit} uid={uid} />
          {trail.map((q, i) => {
            const pq = project(...q);
            return <circle key={i} cx={pq.x} cy={pq.y} r={Math.max(1.5, BALL_R * pq.s * (1 - i * 0.14))} fill="#fff" opacity={0.28 - i * 0.05} />;
          })}
          {!ballInNet && !ballBehindKeeper && script.type !== "aim" && <Ball at={ball} spin={spin} opacity={ballOpacity} uid={uid} />}
          {script.type === "aim" && <Ball at={[0, BALL_R, 0]} uid={uid} />}
          <Shooter joints={shooterJoints} kit={shooterKit} name={shooter?.name ?? ""} root={shooterRoot} uid={uid} />

          {/* the direction line */}
          {aiming && (
            <g>
              <path d={`M${ballPt.x} ${ballPt.y} Q${ctrl.x} ${ctrl.y} ${reticle.x} ${reticle.y}`} fill="none" stroke={aimColor} strokeOpacity=".3" strokeWidth="10" strokeLinecap="round" />
              <path d={`M${ballPt.x} ${ballPt.y} Q${ctrl.x} ${ctrl.y} ${reticle.x} ${reticle.y}`} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 9" className="so-march" />
              <circle cx={reticle.x} cy={reticle.y} r={0.34 * sG} fill={aimColor} fillOpacity=".18" stroke={aimColor} strokeWidth="2.4" />
              <circle cx={reticle.x} cy={reticle.y} r={0.34 * sG + 5} fill="none" stroke={aimColor} strokeOpacity=".5" strokeWidth="1.2" className="so-pulse" style={{ transformOrigin: `${reticle.x}px ${reticle.y}px` }} />
              <path d={`M${reticle.x - 0.52 * sG} ${reticle.y}h${0.3 * sG}M${reticle.x + 0.22 * sG} ${reticle.y}h${0.3 * sG}M${reticle.x} ${reticle.y - 0.52 * sG}v${0.3 * sG}M${reticle.x} ${reticle.y + 0.22 * sG}v${0.3 * sG}`} stroke={aimColor} strokeWidth="2.2" strokeLinecap="round" />
              <circle cx={reticle.x} cy={reticle.y} r="2.4" fill="#fff" />
            </g>
          )}
          {/* a swipe in progress: an arrow from the keeper */}
          {swipe && (Math.abs(swipe.dx) > 8 || swipe.dy < -8) && (() => {
            const f = clamp(swipe.dx / 70, -1, 1);
            const up = clamp(-swipe.dy / 70, 0, 1);
            const horizontal = Math.abs(swipe.dx) > Math.abs(swipe.dy) * 0.7;
            const end = horizontal ? { x: keeperHead.x + f * 70, y: keeperHead.y + 8 } : { x: keeperHead.x, y: keeperHead.y - 18 - up * 30 };
            return <path d={`M${keeperHead.x} ${keeperHead.y + 8} L${end.x} ${end.y}`} stroke={keeperKit.shirt} strokeWidth="5" strokeLinecap="round" opacity=".9" markerEnd={`url(#${uid}arrow)`} />;
          })()}
          {slowMo && <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={`url(#${uid}vig)`} pointerEvents="none" />}
        </svg>
      </div>

      {/* who's who */}
      <div className="pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span className="rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-white/90 uppercase ring-1 ring-white/10 backdrop-blur">
            {yards} yds · {DISTANCE_NAMES[yards]}
          </span>
          {shooter && <NameTag player={shooter} role="Shooter" color={shooterKit.shirt} />}
        </div>
        {keeper && <NameTag player={keeper} role="Keeper" color={keeperKit.shirt} />}
      </div>

      {/* aim hint and the aim clock */}
      {script.type === "aim" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[14%] flex flex-col items-center gap-2">
          {aiming ? (
            <>
              <span className="rounded-full bg-black/65 px-3.5 py-1.5 text-[13px] font-bold text-white ring-1 ring-white/15 backdrop-blur">Drag to aim · let go to shoot</span>
              <span className="h-1 w-28 overflow-hidden rounded-full bg-white/15">
                <span className="block h-full rounded-full bg-signal" style={{ width: `${100 - clamp01(aimMs / AIM_LIMIT) * 100}%` }} />
              </span>
            </>
          ) : !released ? (
            <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur">Run-up…</span>
          ) : null}
        </div>
      )}

      {/* the keeper's swipe hint */}
      {keepMode && !swipe && (
        <div className="pointer-events-none absolute -translate-x-1/2" style={{ ...pct({ x: keeperHead.x, y: keeperHead.y }), marginTop: "-6.2rem" }}>
          <motion.div key={nudge} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center gap-1.5">
            <span className="flex items-center gap-2 rounded-full bg-black/75 px-3.5 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-white ring-1 ring-white/20 backdrop-blur">
              <motion.span animate={{ x: [-4, 2, -4] }} transition={{ repeat: Infinity, duration: 1.1 }}>
                ‹
              </motion.span>
              Swipe the keeper to dive
              <motion.span animate={{ x: [4, -2, 4] }} transition={{ repeat: Infinity, duration: 1.1 }}>
                ›
              </motion.span>
            </span>
            <span className="rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white/85">↑ swipe up to stay in the middle</span>
          </motion.div>
        </div>
      )}
      {keepMode && !swipe && (
        <motion.span className="pointer-events-none absolute -translate-x-1/2 text-4xl drop-shadow-[0_3px_8px_rgba(0,0,0,.7)]" style={{ ...pct({ x: keeperHead.x, y: keeperHead.y }), marginTop: "5.2rem" }} animate={{ x: [-40, 40, -40], rotate: [-14, 14, -14] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}>
          👆
        </motion.span>
      )}

      {/* the result */}
      <AnimatePresence>
        {resultInfo && (
          <motion.div key={`r${script.kick.i}`} initial={{ opacity: 0, scale: 0.4, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.1 }} transition={{ type: "spring", stiffness: 380, damping: 16 }} className="pointer-events-none absolute inset-x-0 top-[24%] flex flex-col items-center text-center">
            <span
              className={cn("font-display text-[clamp(44px,14vw,68px)] leading-none font-black tracking-tight italic", resultInfo.tone === "goal" ? "text-signal" : resultInfo.tone === "miss" ? "text-rose-300" : "")}
              style={{ color: resultInfo.tone === "save" ? keeperKit.shirt : undefined, WebkitTextStroke: "2px rgba(0,0,0,.55)", textShadow: "0 6px 24px rgba(0,0,0,.65), 0 0 40px rgba(255,255,255,.15)" }}
            >
              {resultInfo.title}
            </span>
            <motion.span initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-2.5 rounded-full bg-black/65 px-3.5 py-1.5 text-[13px] font-semibold text-white ring-1 ring-white/10 backdrop-blur">
              {resultLine(script.kick, shooter?.name ?? "", keeper?.name ?? "")}
            </motion.span>
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
  const bits = useMemo(() => Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 100, d: (i % 7) * 0.05, r: ((i * 53) % 360) - 180, c: ["var(--color-signal)", "#fff", "#facc15", "#38bdf8", "#f472b6"][i % 5] })), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {bits.map((b, i) => (
        <motion.span key={i} className="absolute top-[16%] h-2.5 w-1.5 rounded-sm" style={{ left: `${b.x}%`, background: b.c }} initial={{ y: -20, opacity: 0, rotate: 0 }} animate={{ y: [0, 260 + (i % 5) * 34], opacity: [1, 1, 0], rotate: b.r * 3, x: (i % 2 ? 1 : -1) * ((i * 13) % 40) }} transition={{ duration: 1.7, delay: b.d, ease: "easeOut" }} />
      ))}
    </div>
  );
}

/** Kits: yours in your theme colour, theirs in red; keepers in amber and cyan. */
export function kitsFor(isMe) {
  return isMe
    ? { shooter: { shirt: "var(--color-signal)", shorts: "#0b0b10", socks: "var(--color-signal)", number: "#0b0b10", trim: "#0b0b10" }, keeper: { shirt: "#f59e0b", shorts: "#1f2937", socks: "#f59e0b", trim: "#b45309" } }
    : { shooter: { shirt: "#ef4444", shorts: "#f8fafc", socks: "#ef4444", number: "#fff", trim: "#7f1d1d" }, keeper: { shirt: "#22d3ee", shorts: "#0f172a", socks: "#22d3ee", trim: "#0e7490" } };
}

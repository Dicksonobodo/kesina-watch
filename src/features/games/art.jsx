import { useState } from "react";
import { cn } from "@/lib/cn";

/*
 * One picture per game that says what the game is: a real photo (public/games/<id>.webp, from
 * Unsplash, see photoCredits.js). If a photo can't load, the drawn SVG artwork below is shown
 * instead, tinted with the player's colour theme through --color-signal.
 */

const SIGNAL = "var(--color-signal)";

// Faint football pitch used behind the pitch-themed games.
function PitchLines({ opacity = 0.14 }) {
  return (
    <g fill="none" stroke="#fff" strokeOpacity={opacity} strokeWidth="1.5">
      <rect x="14" y="14" width="292" height="132" rx="6" />
      <line x1="160" y1="14" x2="160" y2="146" />
      <circle cx="160" cy="80" r="26" />
      <rect x="14" y="48" width="38" height="64" />
      <rect x="268" y="48" width="38" height="64" />
    </g>
  );
}

const ARTS = {
  predictor: {
    bg: "from-emerald-900 via-emerald-950 to-ink-950",
    svg: (
      <>
        <PitchLines />
        <g fill="none" stroke={SIGNAL} strokeWidth="3">
          <circle cx="160" cy="68" r="52" strokeOpacity=".25" />
          <circle cx="160" cy="68" r="36" strokeOpacity=".5" />
          <circle cx="160" cy="68" r="20" strokeOpacity=".8" />
        </g>
        <circle cx="160" cy="68" r="7" fill={SIGNAL} />
        <path d="M160 68 L226 20" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <path d="M214 18 L228 18 L228 32" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {[["1", 70], ["X", 160], ["2", 250]].map(([t, x], i) => (
          <g key={t}>
            <rect x={x - 28} y="118" width="56" height="26" rx="13" fill={i === 1 ? SIGNAL : "#fff"} fillOpacity={i === 1 ? 1 : 0.12} />
            <text x={x} y="136" textAnchor="middle" fontSize="15" fontWeight="800" fill={i === 1 ? "#0a0a0f" : "#fff"} fontFamily="ui-monospace, monospace">
              {t}
            </text>
          </g>
        ))}
      </>
    ),
  },

  quiz: {
    bg: "from-indigo-900 via-violet-950 to-ink-950",
    svg: (
      <>
        <circle cx="86" cy="80" r="56" fill={SIGNAL} fillOpacity=".12" />
        <circle cx="86" cy="80" r="56" fill="none" stroke={SIGNAL} strokeWidth="3" strokeDasharray="260 100" strokeLinecap="round" transform="rotate(-90 86 80)" />
        <text x="86" y="112" textAnchor="middle" fontSize="92" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">
          ?
        </text>
        {["A", "B", "C", "D"].map((l, i) => (
          <g key={l}>
            <rect x="170" y={24 + i * 28} width="130" height="22" rx="11" fill={i === 1 ? SIGNAL : "#fff"} fillOpacity={i === 1 ? 0.95 : 0.1} />
            <text x="184" y={40 + i * 28} fontSize="12" fontWeight="800" fill={i === 1 ? "#0a0a0f" : "#fff"} fontFamily="ui-monospace, monospace">
              {l}
            </text>
            <rect x="204" y={32 + i * 28} width={[72, 54, 64, 46][i]} height="5" rx="2.5" fill={i === 1 ? "#0a0a0f" : "#fff"} fillOpacity={i === 1 ? 0.5 : 0.25} />
          </g>
        ))}
      </>
    ),
  },

  battle: {
    bg: "from-rose-900 via-fuchsia-950 to-ink-950",
    svg: (
      <>
        {[[78, true], [242, false]].map(([x, mine]) => (
          <g key={x}>
            <circle cx={x} cy="62" r="26" fill={mine ? SIGNAL : "#fff"} fillOpacity={mine ? 0.95 : 0.85} />
            <path d={`M${x - 46} 150 Q${x - 46} 100 ${x} 98 Q${x + 46} 100 ${x + 46} 150 Z`} fill={mine ? SIGNAL : "#fff"} fillOpacity={mine ? 0.8 : 0.7} />
            <rect x={x - 26} y="14" width="52" height="18" rx="9" fill="#000" fillOpacity=".45" />
            <text x={x} y="27" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff" fontFamily="ui-monospace, monospace">
              {mine ? "540" : "480"}
            </text>
          </g>
        ))}
        <path d="M170 12 L148 60 L164 60 L152 96 L188 50 L170 50 Z" fill={SIGNAL} stroke="#0a0a0f" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="160" cy="122" r="19" fill="#0a0a0f" stroke={SIGNAL} strokeWidth="3" />
        <text x="160" y="128" textAnchor="middle" fontSize="16" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif" fontStyle="italic">
          VS
        </text>
      </>
    ),
  },

  guess: {
    bg: "from-teal-900 via-cyan-950 to-ink-950",
    svg: (
      <>
        <circle cx="110" cy="64" r="34" fill="#0a0a0f" stroke={SIGNAL} strokeWidth="3" />
        <path d="M44 156 Q44 108 110 104 Q176 108 176 156 Z" fill="#0a0a0f" stroke={SIGNAL} strokeWidth="3" />
        <text x="110" y="80" textAnchor="middle" fontSize="44" fontWeight="900" fill={SIGNAL} fontFamily="system-ui, sans-serif">
          ?
        </text>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect x="200" y={30 + i * 34} width="100" height="24" rx="12" fill="#fff" fillOpacity={0.18 - i * 0.04} />
            <circle cx="214" cy={42 + i * 34} r="6" fill={SIGNAL} fillOpacity={1 - i * 0.3} />
            <rect x="228" y={39 + i * 34} width={[56, 44, 30][i]} height="6" rx="3" fill="#fff" fillOpacity={0.6 - i * 0.15} />
          </g>
        ))}
        <circle cx="262" cy="130" r="14" fill="none" stroke="#fff" strokeWidth="3" />
        <line x1="272" y1="140" x2="284" y2="152" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      </>
    ),
  },

  shirt: {
    bg: "from-amber-900 via-orange-950 to-ink-950",
    svg: (
      <>
        <defs>
          <linearGradient id="jersey" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c6ff3d" />
            <stop offset="1" stopColor="#7fb81f" />
          </linearGradient>
        </defs>
        <path d="M112 18 L142 10 Q160 30 178 10 L208 18 L246 52 L222 76 L206 62 L206 148 L114 148 L114 62 L98 76 L74 52 Z" fill="url(#jersey)" stroke="#0a0a0f" strokeOpacity=".35" strokeWidth="2" strokeLinejoin="round" />
        <path d="M142 10 Q160 30 178 10" fill="none" stroke="#0a0a0f" strokeOpacity=".5" strokeWidth="4" strokeLinecap="round" />
        <path d="M246 52 L222 76 M74 52 L98 76" stroke="#0a0a0f" strokeOpacity=".35" strokeWidth="6" strokeLinecap="round" />
        <text x="160" y="116" textAnchor="middle" fontSize="70" fontWeight="900" fill="#0a0a0f" fontFamily="system-ui, sans-serif">
          10
        </text>
      </>
    ),
  },

  clubs: {
    bg: "from-sky-900 via-blue-950 to-ink-950",
    svg: (
      <>
        {[[112, SIGNAL, 0.2], [208, "#fff", 0.14]].map(([cx, color, fill], i) => (
          <path key={i} d={`M${cx - 44} 20 H${cx + 44} V76 Q${cx + 44} 118 ${cx} 142 Q${cx - 44} 118 ${cx - 44} 76 Z`} fill={color} fillOpacity={fill} stroke={color} strokeWidth="3" />
        ))}
        <g transform="translate(160 78)">
          <circle r="22" fill="#0a0a0f" stroke={SIGNAL} strokeWidth="3" />
          <path d="M-10 0 L-3 7 L11 -7" fill="none" stroke={SIGNAL} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <path d="M112 54 l4 9 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1 z" fill={SIGNAL} />
        <path d="M208 54 l4 9 10 1 -8 7 3 10 -9 -6 -9 6 3 -10 -8 -7 10 -1 z" fill="#fff" fillOpacity=".8" />
      </>
    ),
  },

  trophy: {
    bg: "from-yellow-900 via-amber-950 to-ink-950",
    svg: (
      <>
        <defs>
          <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffe27a" />
            <stop offset="1" stopColor="#d99a1c" />
          </linearGradient>
        </defs>
        <path d="M116 38 Q80 38 84 72 Q88 96 122 98" fill="none" stroke="url(#gold)" strokeWidth="9" strokeLinecap="round" />
        <path d="M204 38 Q240 38 236 72 Q232 96 198 98" fill="none" stroke="url(#gold)" strokeWidth="9" strokeLinecap="round" />
        <path d="M112 22 H208 V68 Q208 112 160 118 Q112 112 112 68 Z" fill="url(#gold)" />
        <rect x="150" y="116" width="20" height="22" fill="url(#gold)" />
        <rect x="124" y="136" width="72" height="14" rx="5" fill="url(#gold)" />
        <path d="M160 40 l7 15 16 2 -12 11 4 16 -15 -9 -15 9 4 -16 -12 -11 16 -2 z" fill="#0a0a0f" fillOpacity=".35" />
        {[[58, 30, 4], [264, 44, 5], [276, 108, 3], [46, 104, 3.5]].map(([x, y, r], i) => (
          <path key={i} d={`M${x} ${y - r * 2} L${x + r * 0.6} ${y - r * 0.6} L${x + r * 2} ${y} L${x + r * 0.6} ${y + r * 0.6} L${x} ${y + r * 2} L${x - r * 0.6} ${y + r * 0.6} L${x - r * 2} ${y} L${x - r * 0.6} ${y - r * 0.6} Z`} fill="#ffe27a" fillOpacity=".9" />
        ))}
      </>
    ),
  },

  xi: {
    bg: "from-emerald-900 via-green-950 to-ink-950",
    svg: (
      <>
        <PitchLines opacity={0.12} />
        {[
          [160, 128, false],
          [70, 104, false], [124, 108, false], [196, 108, false], [250, 104, false],
          [92, 78, false], [160, 74, true], [228, 78, false],
          [76, 40, true], [160, 34, false], [244, 40, true],
        ].map(([x, y, hidden], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="11" fill={hidden ? SIGNAL : "#fff"} fillOpacity={hidden ? 1 : 0.85} />
            {hidden && (
              <text x={x} y={y + 5} textAnchor="middle" fontSize="15" fontWeight="900" fill="#0a0a0f" fontFamily="system-ui, sans-serif">
                ?
              </text>
            )}
          </g>
        ))}
      </>
    ),
  },

  submit: {
    bg: "from-purple-900 via-violet-950 to-ink-950",
    svg: (
      <>
        <rect x="76" y="20" width="132" height="124" rx="10" fill="#fff" fillOpacity=".92" />
        <rect x="76" y="20" width="132" height="22" rx="10" fill={SIGNAL} />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="92" y={58 + i * 20} width={[96, 80, 90, 56][i]} height="6" rx="3" fill="#0a0a0f" fillOpacity=".25" />
        ))}
        <circle cx="236" cy="58" r="24" fill="#0a0a0f" stroke={SIGNAL} strokeWidth="3" />
        <text x="236" y="70" textAnchor="middle" fontSize="34" fontWeight="900" fill={SIGNAL} fontFamily="system-ui, sans-serif">
          ?
        </text>
        <g transform="translate(206 150) rotate(-45)">
          <rect x="0" y="-8" width="92" height="16" rx="3" fill="#ffc53d" />
          <rect x="0" y="-8" width="14" height="16" rx="3" fill="#ff8aa1" />
          <path d="M92 -8 L116 0 L92 8 Z" fill="#f3d9b1" />
          <path d="M108 -3 L116 0 L108 3 Z" fill="#0a0a0f" />
        </g>
      </>
    ),
  },

  daily: {
    bg: "from-lime-900 via-emerald-950 to-ink-950",
    svg: (
      <>
        <rect x="92" y="22" width="136" height="122" rx="14" fill="#fff" fillOpacity=".94" />
        <path d="M92 36 a14 14 0 0 1 14 -14 h108 a14 14 0 0 1 14 14 v14 h-136 z" fill={SIGNAL} />
        <rect x="120" y="12" width="8" height="20" rx="4" fill="#0a0a0f" />
        <rect x="192" y="12" width="8" height="20" rx="4" fill="#0a0a0f" />
        {Array.from({ length: 15 }).map((_, i) => (
          <circle key={i} cx={112 + (i % 5) * 24} cy={70 + Math.floor(i / 5) * 24} r="5" fill="#0a0a0f" fillOpacity={i === 7 ? 0 : 0.22} />
        ))}
        <circle cx="160" cy="94" r="14" fill={SIGNAL} stroke="#0a0a0f" strokeWidth="2" />
        <path d="M153 94 l5 5 9 -10" fill="none" stroke="#0a0a0f" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  hilo: {
    bg: "from-sky-900 via-blue-950 to-ink-950",
    svg: (
      <>
        <rect x="26" y="26" width="104" height="108" rx="16" fill="#fff" fillOpacity=".1" stroke="#fff" strokeOpacity=".25" />
        <text x="78" y="92" textAnchor="middle" fontSize="44" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">
          18
        </text>
        <text x="78" y="116" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fillOpacity=".6" fontFamily="ui-monospace, monospace">
          GOALS
        </text>
        <rect x="190" y="26" width="104" height="108" rx="16" fill={SIGNAL} fillOpacity=".16" stroke={SIGNAL} strokeOpacity=".7" />
        <text x="242" y="94" textAnchor="middle" fontSize="52" fontWeight="900" fill={SIGNAL} fontFamily="system-ui, sans-serif">
          ?
        </text>
        <path d="M160 44 l16 20 h-10 v16 h-12 v-16 h-10 z" fill="#3ddc84" />
        <path d="M160 116 l-16 -20 h10 v-16 h12 v16 h10 z" fill="#ff5d5d" />
      </>
    ),
  },

  footle: {
    bg: "from-emerald-900 via-teal-950 to-ink-950",
    svg: (
      <>
        {[
          ["#3a3a46", "#e8b931", "#3a3a46", "#3a3a46", "#e8b931", "#3a3a46"],
          ["#2fbf71", "#3a3a46", "#e8b931", "#3a3a46", "#3a3a46", "#e8b931"],
          ["#2fbf71", "#2fbf71", "#3a3a46", "#2fbf71", "#e8b931", "#3a3a46"],
          ["#2fbf71", "#2fbf71", "#2fbf71", "#2fbf71", "#2fbf71", "#2fbf71"],
        ].map((row, y) =>
          row.map((c, x) => <rect key={`${y}${x}`} x={44 + x * 40} y={18 + y * 34} width="34" height="28" rx="7" fill={c} />),
        )}
      </>
    ),
  },

  career: {
    bg: "from-violet-900 via-purple-950 to-ink-950",
    svg: (
      <>
        <path d="M30 118 C70 40 120 150 160 80 S250 30 292 52" fill="none" stroke={SIGNAL} strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
        {[[30, 118, "1"], [106, 96, "2"], [186, 68, "3"], [262, 40, "?"]].map(([x, y, t], i) => (
          <g key={t}>
            <circle cx={x} cy={y} r="19" fill={i === 3 ? SIGNAL : "#0a0a0f"} stroke={SIGNAL} strokeWidth="3" />
            <text x={x} y={y + 6} textAnchor="middle" fontSize="17" fontWeight="900" fill={i === 3 ? "#0a0a0f" : "#fff"} fontFamily="system-ui, sans-serif">
              {t}
            </text>
          </g>
        ))}
      </>
    ),
  },

  grid: {
    bg: "from-rose-900 via-pink-950 to-ink-950",
    svg: (
      <>
        {[0, 1, 2].map((r) =>
          [0, 1, 2].map((c) => {
            const filled = (r + c) % 3 !== 1;
            return (
              <g key={`${r}${c}`}>
                <rect x={104 + c * 48} y={30 + r * 40} width="42" height="34" rx="8" fill={filled ? SIGNAL : "#fff"} fillOpacity={filled ? 0.9 : 0.1} stroke="#fff" strokeOpacity={filled ? 0 : 0.25} />
                {filled && <path d={`M${116 + c * 48} ${48 + r * 40} l7 7 14 -14`} fill="none" stroke="#0a0a0f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
              </g>
            );
          }),
        )}
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={84} cy={47 + i * 40} r="11" fill="#fff" fillOpacity=".85" />
            <circle cx={125 + i * 48} cy={18} r="8" fill="#fff" fillOpacity=".85" />
          </g>
        ))}
      </>
    ),
  },

  keepy: {
    bg: "from-orange-900 via-red-950 to-ink-950",
    svg: (
      <>
        <path d="M60 140 Q160 -30 260 140" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="3" strokeDasharray="3 8" strokeLinecap="round" />
        <circle cx="160" cy="46" r="28" fill="#fff" />
        <path d="M160 30 l13 9 -5 15 h-16 l-5 -15 z" fill="#0a0a0f" />
        <path d="M147 39 l-14 -4 M173 39 l14 -4 M142 54 l-8 12 M178 54 l8 12 M160 58 v14" stroke="#0a0a0f" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="160" cy="146" rx="46" ry="6" fill="#000" fillOpacity=".35" />
        <path d="M120 128 q18 -22 52 -6 q16 8 28 -2 l8 16 H120 z" fill={SIGNAL} />
        <text x="262" y="40" textAnchor="middle" fontSize="30" fontWeight="900" fill={SIGNAL} fontFamily="system-ui, sans-serif">
          +1
        </text>
      </>
    ),
  },
};

/** fit only matters for the drawn fallback: "slice" fills the box, "meet" shows all of it centred. */
export function GameArt({ id, className, fit = "slice" }) {
  const art = ARTS[id];
  const [photoFailed, setPhotoFailed] = useState(false);
  if (!art) return null;
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-gradient-to-br", art.bg, className)}>
      {photoFailed ? (
        <>
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-signal/10 blur-3xl" />
          <svg viewBox="0 0 320 160" preserveAspectRatio={`xMidYMid ${fit}`} className="relative size-full">
            {art.svg}
          </svg>
        </>
      ) : (
        <>
          <img src={`/games/${id}.webp`} alt="" loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} className="absolute inset-0 size-full object-cover" />
          {/* Darkens the bottom and tints with the player's theme so the photo sits in the app's look. */}
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/10 to-ink-950/20" />
          <div className="absolute inset-0 bg-signal/[.07] mix-blend-soft-light" />
        </>
      )}
    </div>
  );
}

export const ART_IDS = Object.keys(ARTS);

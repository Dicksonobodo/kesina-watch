import { cn } from "@/lib/cn";

/*
 * Original artwork for each game: one picture that says what the game is. Drawn as inline SVG
 * (no image files, no licensing), tinted with the player's colour theme through --color-signal.
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
};

/** fit="slice" fills the box (cards); fit="meet" shows the whole picture centred (wide banners). */
export function GameArt({ id, className, fit = "slice" }) {
  const art = ARTS[id];
  if (!art) return null;
  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-gradient-to-br", art.bg, className)}>
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-signal/10 blur-3xl" />
      <svg viewBox="0 0 320 160" preserveAspectRatio={`xMidYMid ${fit}`} className="relative size-full">
        {art.svg}
      </svg>
    </div>
  );
}

export const ART_IDS = Object.keys(ARTS);

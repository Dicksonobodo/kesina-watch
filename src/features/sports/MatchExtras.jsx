import { Play } from "lucide-react";
import { BallIcon } from "@/components/ui/BallIcon";
import { cn } from "@/lib/cn";
import { Crest } from "./Sheets";

/*
 * Extra match-centre sections: official highlights, top performers, minute-by-minute
 * commentary, head-to-head with recent form, and match news.
 */

const HOME = "#6a9e0e";
const AWAY = "#8b6fe0";

function Section({ title, children, className }) {
  return (
    <section className={className}>
      <h3 className="mb-3 font-mono text-[10.5px] font-medium tracking-[.18em] text-mist-500 uppercase">{title}</h3>
      {children}
    </section>
  );
}

const mmss = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");

const KIND_LABEL = { full: "Full highlights", save: "Save", chance: "Near miss" };

export function Highlights({ clips, onPlay }) {
  if (!clips?.length) return null;
  return (
    <Section title="Highlights">
      <div className="-mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7">
        {clips.map((c) => (
          <button key={c.id} onClick={() => onPlay(c)} className="group w-60 shrink-0 snap-start text-left">
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink-800 ring-1 ring-white/10">
              {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />}
              <span className="absolute inset-0 grid place-items-center bg-black/25 transition group-hover:bg-black/10">
                <span className="grid size-11 place-items-center rounded-full bg-signal text-ink-950 shadow-[0_0_30px_-6px_rgb(198_255_61/.8)]">
                  <Play className="ml-0.5 size-5" fill="currentColor" />
                </span>
              </span>
              {c.duration && <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">{mmss(c.duration)}</span>}
              {(c.kind === "goal" || KIND_LABEL[c.kind]) && (
                <span className={cn("absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", c.kind === "goal" ? "bg-signal text-ink-950" : c.kind === "full" ? "bg-white text-ink-950" : "bg-black/70 text-white")}>
                  {c.kind === "goal" ? <>⚽ Goal{c.clock ? ` · ${c.clock}` : ""}</> : KIND_LABEL[c.kind]}
                </span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-[13px] leading-snug font-medium">{c.title}</p>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function Performers({ match, onOpenPlayer }) {
  const sides = match.performers ?? [];
  if (!sides.length) return null;
  const home = sides.find((s) => s.side === "home")?.categories ?? [];
  const away = sides.find((s) => s.side === "away")?.categories ?? [];
  const labels = [...new Set([...home, ...away].map((c) => c.label))];
  return (
    <Section title="Top performers">
      <div className="space-y-2">
        {labels.map((label) => {
          const h = home.find((c) => c.label === label);
          const a = away.find((c) => c.label === label);
          return (
            <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-white/[.03] px-3 py-2.5 ring-1 ring-white/[.05]">
              <PerformerCell c={h} align="left" color={HOME} onOpen={onOpenPlayer} />
              <span className="px-1 text-center text-[11px] text-mist-500">{label}</span>
              <PerformerCell c={a} align="right" color={AWAY} onOpen={onOpenPlayer} />
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function PerformerCell({ c, align, color, onOpen }) {
  if (!c) return <span />;
  return (
    <button
      onClick={() => onOpen({ id: c.playerId, name: c.player, number: c.jersey })}
      className={cn("flex min-w-0 items-center gap-2.5 text-left", align === "right" && "flex-row-reverse text-right")}
    >
      <span className="font-display text-lg font-bold tabular-nums" style={{ color }}>
        {c.value}
      </span>
      <span className="min-w-0 truncate text-[13px] font-medium hover:underline">{c.player}</span>
    </button>
  );
}

export function Commentary({ lines }) {
  if (!lines?.length) return <p className="py-10 text-center text-sm text-mist-500">Commentary starts at kick-off.</p>;
  const important = /goal|card|penalty|substitution|half|full|match ends|kick ?off/i;
  return (
    <ol className="space-y-1">
      {lines.map((l, i) => {
        const key = important.test(l.type) || important.test(l.text.slice(0, 30));
        const goal = /^goal/i.test(l.text) || /goal/i.test(l.type);
        return (
          <li key={i} className={cn("grid grid-cols-[40px_1fr] gap-3 rounded-xl px-2 py-2", key && "bg-white/[.03]")}>
            <span className="pt-0.5 text-right font-mono text-[11px] text-mist-500">{l.clock}</span>
            <p className={cn("text-[13px] leading-relaxed", key ? "text-mist-100" : "text-mist-300")}>
              {goal && <BallIcon className="mr-1.5 size-3.5 -translate-y-px align-middle" />}
              {l.text}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

const RESULT_TONE = { W: "bg-signal text-ink-950", D: "bg-white/15 text-mist-100", L: "bg-live text-white" };

export function HeadToHead({ match }) {
  const form = match.form ?? [];
  const h2h = match.headToHead;
  return (
    <div className="space-y-8">
      {form.length > 0 && (
        <Section title="Recent form (last 5)">
          <div className="space-y-4">
            {["home", "away"].map((side) => {
              const f = form.find((x) => x.side === side);
              if (!f) return null;
              const team = match[side];
              return (
                <div key={side}>
                  <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
                    <Crest src={team.logo} name={team.abbr} className="size-5" /> {team.short}
                    <span className="ml-auto flex gap-1">
                      {f.games.map((g, i) => (
                        <span key={i} className={cn("grid size-6 place-items-center rounded-md font-mono text-[11px] font-bold", RESULT_TONE[g.result] ?? "bg-white/10")}>
                          {g.result || "–"}
                        </span>
                      ))}
                    </span>
                  </div>
                  <ul className="divide-y divide-white/[.04] rounded-2xl bg-white/[.025] px-3 ring-1 ring-white/[.05]">
                    {f.games.map((g, i) => (
                      <li key={i} className="flex items-center gap-2.5 py-2 text-[12.5px]">
                        <span className="w-14 shrink-0 font-mono text-[11px] text-mist-500">{g.date ? new Date(g.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}</span>
                        <span className="w-4 font-mono text-[11px] text-mist-500">{g.venue === "home" ? "H" : "A"}</span>
                        <Crest src={g.opponentLogo} name={g.opponent} className="size-5" />
                        <span className="min-w-0 flex-1 truncate">{g.opponent}</span>
                        <span className="font-mono text-mist-300">{g.score}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {h2h?.games?.length > 0 && (
        <Section title="Head-to-head">
          {h2h.summary && <p className="mb-3 font-display text-lg font-bold">{h2h.summary}</p>}
          <ul className="divide-y divide-white/[.04] rounded-2xl bg-white/[.025] px-3 ring-1 ring-white/[.05]">
            {h2h.games.map((g, i) => {
              const [a, b] = [...g.teams].sort((x, y) => Number(y.home) - Number(x.home));
              return (
                <li key={i} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <span className="w-20 shrink-0 font-mono text-[11px] text-mist-500">{g.date ? new Date(g.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}</span>
                  <span className="flex flex-1 items-center justify-end gap-2">
                    {a?.abbr} <Crest src={a?.logo} name={a?.abbr} className="size-5" />
                  </span>
                  <span className="w-12 text-center font-mono font-semibold">
                    {a?.score}–{b?.score}
                  </span>
                  <span className="flex flex-1 items-center gap-2">
                    <Crest src={b?.logo} name={b?.abbr} className="size-5" /> {b?.abbr}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function MatchNews({ items }) {
  if (!items?.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((n) => (
        <a key={n.link} href={n.link} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-2xl bg-white/[.03] ring-1 ring-white/[.06] transition hover:ring-white/15">
          <div className="aspect-video overflow-hidden bg-ink-800">
            {n.image && <img src={n.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-cover transition duration-500 group-hover:scale-105" />}
          </div>
          <p className="p-3 text-[13.5px] leading-snug font-semibold">{n.title}</p>
        </a>
      ))}
    </div>
  );
}


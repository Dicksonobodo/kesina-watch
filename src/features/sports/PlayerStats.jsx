import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Scale, Search } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { PlayerBadge, Sheet } from "./Sheets";

/*
 * Extra player numbers and two-player comparison, using only data that is current:
 * football players show this season (ESPN, on the player page) and link out to FBref, Sofascore,
 * Transfermarkt and Understat for deeper stats; basketball / NFL / baseball / hockey players
 * also get ESPN's season tables here. Comparing opens a side-by-side of the current numbers,
 * with links to a full comparison on other sites.
 */

const OTHER_SPORT = { nba: "basketball", wnba: "basketball", nfl: "american-football", mlb: "baseball", nhl: "hockey" };
export const sportOf = (league) => OTHER_SPORT[league] ?? "football";

const enc = encodeURIComponent;

function useJson(url) {
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setState({ data: null, error: "" });
    fetch(url, { signal: AbortSignal.timeout(20_000) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Unavailable right now.");
        if (!cancelled) setState({ data: body, error: "" });
      })
      .catch((err) => !cancelled && setState({ data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

const tableGroups = (data) => (data?.categories ?? []).map((c) => ({ title: `${c.title}${c.latestSeason ? ` · ${c.latestSeason}` : ""}`, rows: c.rows }));

/** A player's current numbers as comparable rows: ESPN's season tables, or this season so far for football. */
function usePlayerNumbers(league, id) {
  const football = sportOf(league) === "football";
  const { data, error } = useJson(football ? `/api/sports/player?league=${enc(league)}&id=${enc(id)}` : `/api/sports/playerstats?league=${enc(league)}&id=${enc(id)}`);
  const groups = useMemo(() => {
    if (!data) return [];
    if (!football) return tableGroups(data);
    // Cards, fouls and offsides are better when lower.
    const rows = (data.season ?? []).map((s) => {
      const n = Number(s.value);
      return {
        key: s.label,
        label: s.label.replace("Starts-Substitute Appearances", "Starts (sub apps)"),
        value: s.value,
        fmt: Number.isNaN(n) ? "text" : "int",
        better: /card|foul|offside/i.test(s.label) ? "low" : Number.isNaN(n) ? null : "high",
      };
    });
    return rows.length ? [{ title: "This season so far", rows }] : [];
  }, [data, football]);
  return { data, error, groups };
}

export function fmt(value, kind) {
  if (value === null || value === undefined) return "–";
  const n = Number(value);
  if (kind === "text" || Number.isNaN(n)) return String(value);
  return Math.round(n).toLocaleString();
}

const Pill = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-semibold text-mist-100 ring-1 ring-white/15 transition hover:bg-white/[.06] hover:ring-white/30">
    {children} <ExternalLink className="size-3 text-mist-500" />
  </a>
);

/* ---------- on the player page ---------- */

/** Season tables for non-football sports, the Compare button, and links to other sites. */
export function DetailedStats({ league, id, name, team, onCompare }) {
  const football = sportOf(league) === "football";
  // Football's current numbers are already shown higher up the page, so only other sports fetch tables.
  const { data, error } = useJson(football ? null : `/api/sports/playerstats?league=${enc(league)}&id=${enc(id)}`);
  const groups = useMemo(() => tableGroups(data), [data]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">{football ? "More" : "Season stats"}</h3>
        <button onClick={onCompare} className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-signal ring-1 ring-signal/40 transition hover:bg-signal/10">
          <Scale className="size-3.5" /> Compare
        </button>
      </div>

      {!football && !data && !error && (
        <div className="grid place-items-center py-8">
          <Spinner className="size-5 text-signal" />
        </div>
      )}
      {!football && error && <p className="text-sm text-mist-500">{error}</p>}
      {!football && data && groups.length === 0 && <p className="text-sm text-mist-500">No season stats yet.</p>}

      {!football && (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-2 text-[13px] font-semibold text-mist-300">{g.title}</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {g.rows.map((r) => (
                  <div key={r.key} className="rounded-2xl bg-white/[.04] p-3 ring-1 ring-white/[.06]">
                    <p className="font-display text-lg font-bold tabular-nums">{fmt(r.value, r.fmt)}</p>
                    <p className="text-[11px] leading-tight text-mist-500">{r.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ElsewhereLinks name={name} team={team} football={football} />
    </section>
  );
}

// Other sites have the deeper numbers (xG, passing, defending…). Links open in a new tab, so
// this tab stays where it is and the visitor comes straight back to it.
function ElsewhereLinks({ name, team, football }) {
  if (!name) return null;
  const q = enc(name);
  const withTeam = enc(`${name} ${team ?? ""}`.trim());
  const links = football
    ? [
        ["FBref", `https://fbref.com/en/search/search.fcgi?search=${q}`],
        ["Sofascore", `https://duckduckgo.com/?q=!ducky+sofascore+player+${withTeam}`],
        ["Transfermarkt", `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${q}`],
        ["Understat", `https://duckduckgo.com/?q=!ducky+understat+player+${withTeam}`],
      ]
    : [["ESPN", `https://www.espn.com/search/_/q/${q}`]];
  return (
    <div className="mt-6 rounded-2xl bg-white/[.03] p-4 ring-1 ring-white/[.06]">
      <p className="text-[13px] font-semibold text-mist-300">Want even more stats?</p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">See {name.split(" ").slice(-1)[0]} on other sites. They open in a new tab, so Dixon Watch stays open here.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map(([label, href]) => (
          <Pill key={label} href={href}>
            {label}
          </Pill>
        ))}
      </div>
    </div>
  );
}

/* ---------- pick who to compare with ---------- */

export function ComparePicker({ league, exclude, onPick, onClose }) {
  const [text, setText] = useState("");
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const sport = sportOf(league);
  const q = text.trim();

  useEffect(() => {
    if (q.length < 2) {
      setPlayers([]);
      return undefined;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/sports/search?q=${enc(q)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body) => setPlayers((body.players ?? []).filter((p) => p.sport === sport && p.id !== exclude)))
        .catch(() => {})
        .finally(() => !controller.signal.aborted && setBusy(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, sport, exclude]);

  return (
    <Sheet onClose={onClose} label="Compare with" z="z-[99]">
      <div className="p-6">
        <p className="font-display text-xl font-bold tracking-tight">Compare with…</p>
        <div className="mt-4 flex h-12 items-center gap-3 rounded-full bg-white/[.05] px-4 ring-1 ring-white/10 focus-within:ring-signal/50">
          <Search className="size-[18px] shrink-0 text-mist-500" />
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a player" aria-label="Search a player" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700" />
          {busy && <Spinner className="size-4 text-mist-500" />}
        </div>
        <ul className="mt-3 space-y-1">
          {players.map((p) => (
            <li key={`${p.league}-${p.id}`}>
              <button onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-white/[.06]">
                <PlayerBadge name={p.name} team={p.subtitle} className="size-10 rounded-xl text-xs" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-[11px] text-mist-500">{p.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
          {q.length >= 2 && !busy && players.length === 0 && <li className="py-6 text-center text-sm text-mist-500">No players found.</li>}
        </ul>
      </div>
    </Sheet>
  );
}

/* ---------- side by side ---------- */

const better = (a, b, rule) => {
  const x = Number(a);
  const y = Number(b);
  if (!rule || Number.isNaN(x) || Number.isNaN(y) || x === y) return null;
  return (rule === "high" ? x > y : x < y) ? "a" : "b";
};

export function CompareSheet({ a, b, onClose }) {
  const left = usePlayerNumbers(a.league, a.id);
  const right = usePlayerNumbers(b.league, b.id);
  const loading = (!left.data && !left.error) || (!right.data && !right.error);
  const football = sportOf(a.league) === "football";

  // Rows present for both players, grouped.
  const groups = useMemo(() => {
    if (!left.data || !right.data) return [];
    return left.groups
      .map((g) => {
        const other = right.groups.find((x) => x.title === g.title);
        if (!other) return null;
        const rows = g.rows.map((r) => ({ ...r, other: other.rows.find((o) => o.key === r.key) ?? other.rows.find((o) => o.label === r.label) })).filter((r) => r.other);
        return rows.length ? { title: g.title, rows } : null;
      })
      .filter(Boolean);
  }, [left, right]);

  const nameA = left.data?.name || a.name;
  const nameB = right.data?.name || b.name;

  return (
    <Sheet onClose={onClose} label={`${nameA} vs ${nameB}`} z="z-[100]" wide>
      <div className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Header p={left.data} fallback={a} />
          <span className="font-mono text-xs text-mist-500">VS</span>
          <Header p={right.data} fallback={b} />
        </div>

        {loading && (
          <div className="grid place-items-center py-16">
            <Spinner className="size-6 text-signal" />
          </div>
        )}
        {(left.error || right.error) && <p className="mt-6 text-center text-sm text-mist-500">{left.error || right.error}</p>}

        {!loading && groups.length > 0 && (
          <div className="mt-6 space-y-6">
            {groups.map((g) => (
              <div key={g.title}>
                <p className="mb-2 text-center font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">{g.title}</p>
                <div className="space-y-1.5">
                  {g.rows.map((r) => {
                    const win = better(r.value, r.other.value, r.better);
                    const x = Number(r.value) || 0;
                    const y = Number(r.other.value) || 0;
                    const max = Math.max(x, y) || 1;
                    const numeric = r.fmt !== "text";
                    return (
                      <div key={r.key} className="grid grid-cols-[1fr_minmax(96px,auto)_1fr] items-center gap-x-3 gap-y-0.5 rounded-xl px-1 py-1.5 text-sm">
                        <span className={cn("text-right font-display font-bold tabular-nums", win === "a" ? "text-signal" : "text-mist-100")}>{fmt(r.value, r.fmt)}</span>
                        <span className="text-center text-[11.5px] leading-tight text-mist-500">{r.label}</span>
                        <span className={cn("font-display font-bold tabular-nums", win === "b" ? "text-signal" : "text-mist-100")}>{fmt(r.other.value, r.other.fmt)}</span>
                        {numeric && (
                          <>
                            <span className="flex justify-end">
                              <span className={cn("h-1 rounded-full", win === "a" ? "bg-signal" : "bg-white/20")} style={{ width: `${(x / max) * 100}%` }} />
                            </span>
                            <span />
                            <span className="flex">
                              <span className={cn("h-1 rounded-full", win === "b" ? "bg-signal" : "bg-white/20")} style={{ width: `${(y / max) * 100}%` }} />
                            </span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-center text-[11px] text-mist-700">Green marks the better number; ties and neutral stats stay grey.</p>
          </div>
        )}
        {!loading && groups.length === 0 && !left.error && !right.error && <p className="mt-6 text-center text-sm text-mist-500">No numbers to compare yet this season.</p>}

        <CompareLinks nameA={nameA} nameB={nameB} football={football} />
      </div>
    </Sheet>
  );
}

// Full comparisons (xG, passing, defending…) live on other sites. New tab: this one stays open.
function CompareLinks({ nameA, nameB, football }) {
  const pair = enc(`${nameA} vs ${nameB}`);
  const web = ["Search the web", `https://www.google.com/search?q=${pair}+stats+comparison`];
  const links = football
    ? [
        ["FBref", `https://duckduckgo.com/?q=!ducky+fbref+${pair}+comparison`],
        ["Sofascore", `https://duckduckgo.com/?q=!ducky+sofascore+${pair}+comparison`],
        ["Transfermarkt", `https://duckduckgo.com/?q=!ducky+transfermarkt+${pair}+comparison`],
        web,
      ]
    : [web];
  return (
    <div className="mt-8 rounded-2xl bg-white/[.03] p-4 ring-1 ring-white/[.06]">
      <p className="text-[13px] font-semibold text-mist-300">Full comparison with every stat</p>
      <p className="mt-1 text-xs leading-relaxed text-mist-500">Opens in a new tab, so Dixon Watch stays open here. Each link searches for this pair; if it lands on a search page, pick the comparison result.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map(([label, href]) => (
          <Pill key={label} href={href}>
            {label}
          </Pill>
        ))}
      </div>
    </div>
  );
}

function Header({ p, fallback }) {
  const name = p?.name || fallback.name;
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <PlayerBadge name={name} team={p?.team ?? ""} photo={p?.photo} className="size-20 rounded-3xl text-2xl" />
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-bold tracking-tight">{name}</p>
        <p className="truncate text-xs text-mist-500">{[p?.team, p?.position].filter(Boolean).join(" · ")}</p>
        <p className="truncate text-[11px] text-mist-700">{[p?.age && `${p.age} yrs`, p?.nationality].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}

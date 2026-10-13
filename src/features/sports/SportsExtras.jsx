import { useEffect, useRef, useState } from "react";
import { Search, Trophy, X } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { Crest, PlayerBadge } from "./Sheets";

/* ---------- search ---------- */

/** One box for competitions, teams, players and today's matches. */
export function SearchBox({ matches, onCompetition, onTeam, onPlayer, onMatch }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const box = useRef(null);
  const q = text.trim();

  useEffect(() => {
    if (q.length < 2) {
      setResult(null);
      setBusy(false);
      return undefined;
    }
    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/sports/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body) => setResult(body))
        .catch(() => !controller.signal.aborted && setResult({ competitions: [], teams: [], players: [] }))
        .finally(() => !controller.signal.aborted && setBusy(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e) => !box.current?.contains(e.target) && setFocused(false);
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const needle = q.toLowerCase();
  const games = q.length >= 2 ? (matches ?? []).filter((m) => `${m.home.name} ${m.away.name}`.toLowerCase().includes(needle)).slice(0, 5) : [];
  const empty = result && !busy && !games.length && !result.competitions?.length && !result.teams?.length && !result.players?.length;
  const open = focused && q.length >= 2;
  const pick = (fn) => (item) => {
    setFocused(false);
    setText("");
    fn(item);
  };

  return (
    <div ref={box} className="relative">
      <div className="flex h-12 items-center gap-3 rounded-full bg-white/[.04] px-4 ring-1 ring-white/10 transition focus-within:bg-white/[.06] focus-within:ring-signal/50">
        <Search className="size-[18px] shrink-0 text-mist-500" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search leagues, teams, players, sports…"
          aria-label="Search sports"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-mist-700"
        />
        {busy && <Spinner className="size-4 text-mist-500" />}
        {text && (
          <button onClick={() => setText("")} aria-label="Clear search" className="grid size-6 place-items-center rounded-full text-mist-500 hover:bg-white/10">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute inset-x-0 top-14 z-40 max-h-[70dvh] overflow-y-auto rounded-3xl bg-ink-900/95 p-2 shadow-2xl ring-1 shadow-black/60 ring-white/10 backdrop-blur-xl">
          {!result && busy && <p className="px-4 py-6 text-center text-sm text-mist-500">Searching…</p>}
          {empty && <p className="px-4 py-6 text-center text-sm text-mist-500">Nothing found for “{q}”.</p>}

          <Group title="Matches" show={games.length}>
            {games.map((m) => (
              <Row key={m.id} onClick={() => pick(onMatch)(m)} icon={<Crest src={m.home.logo} name={m.home.name} className="size-7" />}>
                <span className="block truncate text-sm font-medium">
                  {m.home.name} vs {m.away.name}
                </span>
                <span className="block truncate text-[11px] text-mist-500">
                  {m.leagueName}
                  {m.state === "in" ? " · live" : ""}
                </span>
              </Row>
            ))}
          </Group>
          <Group title="Competitions" show={result?.competitions?.length}>
            {result?.competitions?.map((c) => (
              <Row
                key={c.id}
                onClick={() => pick(onCompetition)(c)}
                icon={
                  <span className="grid size-7 place-items-center rounded-full bg-white/10">
                    <Trophy className="size-3.5 text-signal" />
                  </span>
                }
              >
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block truncate text-[11px] text-mist-500">{c.region}</span>
              </Row>
            ))}
          </Group>
          <Group title="Teams" show={result?.teams?.length}>
            {result?.teams?.map((t) => (
              <Row key={`${t.league}-${t.id}`} onClick={() => pick(onTeam)(t)} icon={<Crest src={t.logo} name={t.name} className="size-7" />}>
                <span className="block truncate text-sm font-medium">{t.name}</span>
                <span className="block truncate text-[11px] text-mist-500">{t.subtitle}</span>
              </Row>
            ))}
          </Group>
          <Group title="Players" show={result?.players?.length}>
            {result?.players?.map((p) => (
              <Row key={`${p.league}-${p.id}`} onClick={() => pick(onPlayer)(p)} icon={<PlayerBadge name={p.name} team={p.subtitle} className="size-8 rounded-xl text-[10px]" />}>
                <span className="block truncate text-sm font-medium">{p.name}</span>
                <span className="block truncate text-[11px] text-mist-500">{p.subtitle}</span>
              </Row>
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group({ title, show, children }) {
  if (!show) return null;
  return (
    <div className="pb-1">
      <p className="px-3 pt-2 pb-1 font-mono text-[10.5px] tracking-[.18em] text-mist-500 uppercase">{title}</p>
      {children}
    </div>
  );
}

function Row({ icon, onClick, children }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition hover:bg-white/[.06]">
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

/* ---------- league table ---------- */

/** The standings for one competition (conferences / groups shown one under another). */
export function StandingsView({ league, leagueName, onTeam }) {
  const [state, setState] = useState({ data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: "" });
    fetch(`/api/sports/standings?league=${encodeURIComponent(league)}`, { signal: AbortSignal.timeout(15_000) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "The table is unavailable right now.");
        if (!cancelled) setState({ data: body, error: "" });
      })
      .catch((err) => !cancelled && setState({ data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [league]);

  const { data, error } = state;
  const message = "rounded-2xl bg-white/[.025] px-4 py-6 text-center text-sm text-mist-500 ring-1 ring-white/[.06]";
  if (error) return <p className={message}>{error}</p>;
  if (!data) return <div className="skeleton h-96 rounded-3xl" />;
  if (!data.groups.length) return <p className={message}>No table for {leagueName} yet.</p>;

  const notes = [...new Map(data.groups.flatMap((g) => g.rows).filter((r) => r.note).map((r) => [r.note, r.noteColor])).entries()];

  return (
    <div className="space-y-5">
      {data.groups.map((g) => (
        <div key={g.name} className="overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
          {(data.groups.length > 1 || g.name) && <p className="border-b border-white/[.05] px-4 py-3 text-[13px] font-semibold text-mist-300">{g.name}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm tabular-nums">
              <thead>
                <tr className="font-mono text-[10.5px] tracking-wider text-mist-500 uppercase">
                  <th className="w-10 py-2.5 pl-4 text-left font-medium">#</th>
                  <th className="py-2.5 text-left font-medium">Team</th>
                  {data.columns.map((c) => (
                    <th key={c.key} className="px-2 py-2.5 text-right font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[.04]">
                {g.rows.map((r) => (
                  <tr key={r.teamId ?? r.team} className="transition hover:bg-white/[.03]">
                    <td className="relative py-2.5 pl-4 font-mono text-[12px] text-mist-500">
                      {r.noteColor && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full" style={{ background: r.noteColor }} />}
                      {r.rank}
                    </td>
                    <td className="py-2.5">
                      <button onClick={() => r.teamId && onTeam?.(r.teamId)} className="flex items-center gap-2.5 text-left">
                        <Crest src={r.logo} name={r.team} className="size-5" />
                        <span className="max-w-[150px] truncate font-medium hover:underline sm:max-w-none">{r.short || r.team}</span>
                      </button>
                    </td>
                    {r.values.map((v, i) => (
                      <td key={data.columns[i].key} className={cn("px-2 py-2.5 text-right", i === r.values.length - 1 && data.sport === "football" ? "pr-4 font-display font-bold text-mist-100" : "text-mist-300")}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {notes.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-mist-500">
          {notes.map(([text, color]) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color || "#888" }} /> {text}
            </span>
          ))}
        </p>
      )}
      {data.season && <p className="px-1 text-[11px] text-mist-700">{data.season}</p>}
    </div>
  );
}

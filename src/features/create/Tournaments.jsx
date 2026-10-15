import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Check, Copy, Crown, ListOrdered, Plus, RefreshCw, Shuffle, Trash2, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { Card, ErrorNote, Eyebrow } from "@/features/games/ui";
import { GameArt } from "@/features/games/art";
import * as T from "./tourney";

/*
 * Tournament creator: make a league, a Champions League style or World Cup style tournament, or
 * a knockout cup for your own real-life games. Register the teams, type in the scores, and the
 * tables, qualifiers and bracket update themselves. Share the link so everyone can follow.
 */

const FORMAT_ICONS = { league: ListOrdered, ucl: Trophy, worldcup: Trophy, cup: Trophy };
const ago = (at) => {
  const s = (Date.now() - at) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86_400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86_400)}d ago`;
};

const Back = ({ to = "/games", children = "Games" }) => (
  <Link to={to} className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
    <ArrowLeft className="size-4" /> {children}
  </Link>
);

/* ---------- my tournaments + making a new one ---------- */

export function Tournaments() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);

  useEffect(() => {
    gamesApi("create.list", { kind: "tourney" })
      .then((r) => setItems(r.items))
      .catch((e) => (setError(e.message), setItems([])));
  }, []);

  if (making) return <NewTournament onCancel={() => setMaking(false)} />;
  return (
    <div className="mx-auto max-w-3xl">
      <Back />
      <Card className="overflow-hidden">
        <GameArt id="tourney" fit="meet" className="-mx-5 -mt-5 mb-5 h-40 sm:-mx-6 sm:-mt-6" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Tournament creator</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mist-500">Run your own league, a Champions League or World Cup style tournament, or a knockout cup for your real-life games. Add the teams, type in the scores, and the tables and bracket update themselves.</p>
        <Button size="lg" className="mt-5" onClick={() => setMaking(true)}>
          <Plus className="size-4" /> New tournament
        </Button>
      </Card>

      <div className="mt-6">
        <Eyebrow className="mb-3">Your tournaments</Eyebrow>
        <ErrorNote>{error}</ErrorNote>
        {items === null && <div className="skeleton h-20 rounded-3xl" />}
        {items?.length === 0 && <p className="rounded-3xl border border-dashed border-white/[.1] px-5 py-8 text-center text-sm text-mist-500">Nothing yet. Make your first one above.</p>}
        <div className="space-y-2.5">
          {items?.map((it) => (
            <Link key={it.id} to={`/games/tournaments/${it.id}`} className="flex items-center gap-4 rounded-3xl bg-white/[.03] p-4 ring-1 ring-white/[.07] transition hover:bg-white/[.05] hover:ring-signal/40">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-signal/10 text-signal ring-1 ring-signal/25">
                <Trophy className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{it.name}</span>
                <span className="block truncate text-xs text-mist-500">{it.info ?? ""}</span>
              </span>
              <span className="shrink-0 text-[11px] text-mist-500">{ago(it.updatedAt)}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function NewTournament({ onCancel }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [format, setFormat] = useState("league");
  const [teams, setTeams] = useState([]);
  const [entry, setEntry] = useState("");
  const [paste, setPaste] = useState(false);
  const [legs, setLegs] = useState(1);
  const [cupLegs, setCupLegs] = useState(1);
  const [groups, setGroups] = useState(2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const groupChoices = T.groupOptions(teams.length);
  useEffect(() => {
    if (groupChoices.length && !groupChoices.includes(groups)) setGroups(groupChoices[0]);
  }, [groupChoices.join(","), groups]); // eslint-disable-line react-hooks/exhaustive-deps

  function add(raw) {
    const names = raw.split(/\n|,/).map((s) => s.trim().slice(0, 40)).filter(Boolean);
    setTeams((list) => {
      const out = [...list];
      for (const n of names) if (!out.some((x) => x.toLowerCase() === n.toLowerCase()) && out.length < 64) out.push(n);
      return out;
    });
    setEntry("");
  }

  const needsGroups = format === "ucl" || format === "worldcup";
  const minTeams = needsGroups ? 4 : 3;
  const problem = name.trim().length < 2 ? "Give the tournament a name." : teams.length < minTeams ? `Add at least ${minTeams} teams.` : needsGroups && !groupChoices.length ? "This format needs between 4 and 48 teams (2 to 6 in each group)." : "";

  async function create() {
    if (problem) return setError(problem);
    setSaving(true);
    setError("");
    try {
      const t = T.createTournament({ name, format, teams, legs, groups, cupLegs });
      const p = T.progress(t);
      const r = await gamesApi("create.save", { kind: "tourney", name: t.name, data: t, info: `${T.FORMATS[format].title} · ${teams.length} teams · ${p.total} matches` });
      navigate(`/games/tournaments/${r.id}`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onCancel} className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Tournaments
      </button>
      <h1 className="font-display text-3xl font-extrabold tracking-tight">New tournament</h1>

      <Card className="mt-5">
        <Eyebrow>1 · Name</Eyebrow>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Estate Cup 2026" className="mt-3 h-12 w-full rounded-2xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/50" />
      </Card>

      <Card className="mt-3">
        <Eyebrow>2 · Format</Eyebrow>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(T.FORMATS).map(([id, f]) => {
            const Icon = FORMAT_ICONS[id];
            return (
              <button key={id} onClick={() => setFormat(id)} className={cn("flex items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition", format === id ? "bg-signal/10 ring-signal/60" : "bg-white/[.03] ring-white/[.08] hover:bg-white/[.06]")}>
                <Icon className={cn("mt-0.5 size-5 shrink-0", format === id ? "text-signal" : "text-mist-500")} />
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-mist-500">{f.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          {format === "league" && (
            <Segmented value={legs} onChange={setLegs} options={[[1, "Play each other once"], [2, "Home and away"]]} />
          )}
          {format === "cup" && <Segmented value={cupLegs} onChange={setCupLegs} options={[[1, "One match a round"], [2, "Two legs (final one match)"]]} />}
          {needsGroups && (
            <>
              <span className="text-mist-500">Groups:</span>
              {groupChoices.length ? (
                <Segmented value={groups} onChange={setGroups} options={groupChoices.map((g) => [g, `${g} groups`])} />
              ) : (
                <span className="text-xs text-mist-500">add teams to choose</span>
              )}
              <span className="w-full text-xs text-mist-500">Top two of each group go through. {format === "ucl" ? "Groups and knockouts are home and away; the final is one match." : "Every knockout is one match; draws go to penalties."}</span>
            </>
          )}
        </div>
      </Card>

      <Card className="mt-3">
        <div className="flex items-center justify-between">
          <Eyebrow>3 · Teams ({teams.length})</Eyebrow>
          <button onClick={() => setPaste((p) => !p)} className="text-xs font-semibold text-signal">
            {paste ? "Add one by one" : "Paste a list"}
          </button>
        </div>
        {paste ? (
          <div className="mt-3">
            <textarea value={entry} onChange={(e) => setEntry(e.target.value)} rows={6} placeholder={"One team per line\nLions FC\nBlock 4 United\n…"} className="w-full rounded-2xl bg-white/[.05] p-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/50" />
            <Button className="mt-2" onClick={() => add(entry)} disabled={!entry.trim()}>
              Add these teams
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (entry.trim()) add(entry);
            }}
            className="mt-3 flex gap-2"
          >
            <input value={entry} onChange={(e) => setEntry(e.target.value)} maxLength={40} placeholder="Team or player name" className="h-11 min-w-0 flex-1 rounded-2xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/50" />
            <Button type="submit" disabled={!entry.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </form>
        )}
        {teams.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {teams.map((tname, i) => (
              <span key={tname} className="inline-flex items-center gap-1.5 rounded-full bg-white/[.06] py-1 pr-1.5 pl-3 text-sm ring-1 ring-white/10">
                <span className="font-mono text-[10px] text-mist-500">{i + 1}</span> {tname}
                <button onClick={() => setTeams((l) => l.filter((x) => x !== tname))} aria-label={`Remove ${tname}`} className="grid size-5 place-items-center rounded-full text-mist-500 hover:bg-white/10 hover:text-white">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-mist-500">
          <Shuffle className="size-3.5" /> The fixtures (and groups) are drawn at random when you create it.
        </p>
      </Card>

      <div className="mt-4">
        <ErrorNote>{error}</ErrorNote>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="lg" onClick={create} loading={saving} disabled={Boolean(problem)}>
          Create tournament
        </Button>
        <Button size="lg" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {problem && <p className="mt-2 text-xs text-mist-500">{problem}</p>}
    </div>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <span className="inline-flex flex-wrap gap-1 rounded-2xl bg-white/[.04] p-1 ring-1 ring-white/[.08]">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={cn("rounded-xl px-3 py-1.5 text-[13px] font-semibold transition", value === v ? "bg-signal text-ink-950" : "text-mist-300 hover:bg-white/[.06]")}>
          {label}
        </button>
      ))}
    </span>
  );
}

/* ---------- one tournament ---------- */

export function TournamentView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null); // { name, data, mine, ownerName }
  const [t, setT] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState(null);
  const [saveState, setSaveState] = useState("saved"); // saved | saving | unsaved | error
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef(0);

  const load = useCallback(() => {
    gamesApi("create.get", { id })
      .then((r) => {
        setDoc(r);
        setT(r.data);
        setTab((cur) => cur ?? (r.data.format === "league" ? "table" : r.data.format === "cup" ? "bracket" : "groups"));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  // Someone else's tournament: refresh every 30 seconds so the scores keep up.
  useEffect(() => {
    if (!doc || doc.mine) return;
    const timerId = setInterval(load, 30_000);
    return () => clearInterval(timerId);
  }, [doc, load]);

  const save = useCallback(
    (next) => {
      clearTimeout(timer.current);
      setSaveState("unsaved");
      timer.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          const p = T.progress(next);
          const ch = T.champion(next);
          const info = `${T.FORMATS[next.format].title} · ${next.teams.length} teams · ${ch.final ? `🏆 ${ch.name}` : `${p.played}/${p.total} played`}`;
          await gamesApi("create.save", { id, kind: "tourney", name: next.name, data: next, info });
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      }, 700);
    },
    [id],
  );

  function setScore(matchId, patch) {
    setT((cur) => {
      const scores = { ...cur.scores };
      const merged = { ...(scores[matchId] ?? {}), ...patch };
      for (const k of Object.keys(merged)) if (merged[k] === null || merged[k] === undefined) delete merged[k];
      if (Object.keys(merged).length) scores[matchId] = merged;
      else delete scores[matchId];
      const next = { ...cur, scores };
      save(next);
      return next;
    });
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    await gamesApi("create.delete", { id }).catch(() => {});
    navigate("/games/tournaments");
  }

  async function share() {
    const url = `${location.origin}/games/tournaments/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: t.name, text: `Follow ${t.name} on Dixon Watch`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelled */
    }
  }

  if (error) return (
    <div className="mx-auto max-w-3xl">
      <Back to="/games/tournaments">Tournaments</Back>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
  if (!t) return (
    <div className="grid place-items-center py-24">
      <Spinner className="size-6 text-signal" />
    </div>
  );

  const editable = doc.mine;
  const ch = T.champion(t);
  const p = T.progress(t);
  const tabs = t.format === "league" ? [["table", "Table"], ["fixtures", "Fixtures"]] : t.format === "cup" ? [["bracket", "Bracket"]] : [["groups", "Groups"], ["bracket", "Knockout"]];

  return (
    <div className="mx-auto max-w-4xl">
      <Back to="/games/tournaments">Tournaments</Back>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>{T.FORMATS[t.format].title}</Eyebrow>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight break-words">{t.name}</h1>
          <p className="mt-1 text-sm text-mist-500">
            {t.teams.length} teams · {p.played} of {p.total} matches played
            {!editable && doc.ownerName ? ` · run by ${doc.ownerName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && <span className={cn("text-xs", saveState === "error" ? "text-live" : "text-mist-500")}>{saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Editing…" : saveState === "error" ? "Couldn't save. Check your connection." : "✓ Saved"}</span>}
          {!editable && (
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="size-4" /> Refresh
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={share}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Link copied" : "Share"}
          </Button>
          {editable && (
            <Button variant="subtle" size="sm" onClick={remove} onMouseLeave={() => setConfirmDelete(false)} className={confirmDelete ? "!text-live" : ""}>
              <Trash2 className="size-4" /> {confirmDelete ? "Tap again to delete" : "Delete"}
            </Button>
          )}
        </div>
      </div>

      {ch.final && (
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-5 flex items-center gap-4 rounded-3xl bg-gradient-to-r from-amber-400/20 via-amber-300/10 to-transparent p-5 ring-1 ring-amber-300/40">
          <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 shadow-lg">
            <Crown className="size-7" fill="currentColor" />
          </span>
          <span>
            <span className="block font-mono text-[11px] tracking-[.2em] text-amber-200 uppercase">Champions</span>
            <span className="block font-display text-2xl font-extrabold">{ch.name}</span>
          </span>
        </motion.div>
      )}

      {!editable && <p className="mt-4 rounded-2xl bg-white/[.04] px-4 py-2.5 text-xs text-mist-500">You're watching this tournament. Only the person who made it can enter scores.</p>}

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-white/[.03] p-1 ring-1 ring-white/[.06]">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn("flex-1 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition", tab === k ? "bg-white/[.1] text-white" : "text-mist-500 hover:text-mist-100")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "table" && <TableCard t={t} rows={T.table(t, t.teams.map((x) => x.id), t.fixtures)} highlight={1} />}
        {tab === "fixtures" && <Fixtures t={t} fixtures={t.fixtures} editable={editable} setScore={setScore} />}
        {tab === "groups" && (
          <div className="grid gap-4 lg:grid-cols-2">
            {t.groups.map((_, gi) => (
              <div key={gi} className="space-y-2">
                <TableCard t={t} title={`Group ${T.groupLetter(gi)}`} rows={T.groupTable(t, gi)} highlight={2} />
                <Fixtures t={t} fixtures={T.groupFixtures(t, gi)} editable={editable} setScore={setScore} compact />
              </div>
            ))}
          </div>
        )}
        {tab === "bracket" && <Bracket t={t} editable={editable} setScore={setScore} />}
      </div>
    </div>
  );
}

function TableCard({ t, rows, title, highlight = 0 }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white/[.03] ring-1 ring-white/[.07]">
      {title && <p className="border-b border-white/[.06] px-4 py-2.5 font-display text-[15px] font-bold">{title}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-mist-500">
              <th className="py-2 pl-4 text-left font-medium">#</th>
              <th className="py-2 text-left font-medium">Team</th>
              {["P", "W", "D", "L", "GD", "Pts"].map((h) => (
                <th key={h} className={cn("px-1.5 py-2 text-center font-medium", h === "Pts" && "pr-4")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t border-white/[.04]">
                <td className="py-2 pl-4">
                  <span className={cn("grid size-6 place-items-center rounded-md font-mono text-[11px]", i < highlight ? "bg-signal/15 text-signal" : "text-mist-500")}>{i + 1}</span>
                </td>
                <td className="max-w-40 truncate py-2 font-medium">{r.name}</td>
                <td className="px-1.5 text-center tabular-nums text-mist-300">{r.p}</td>
                <td className="px-1.5 text-center tabular-nums text-mist-300">{r.w}</td>
                <td className="px-1.5 text-center tabular-nums text-mist-300">{r.d}</td>
                <td className="px-1.5 text-center tabular-nums text-mist-300">{r.l}</td>
                <td className="px-1.5 text-center tabular-nums text-mist-300">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                <td className="px-1.5 pr-4 text-center font-bold tabular-nums">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {highlight > 0 && t.format !== "league" && <p className="px-4 pb-2.5 text-[11px] text-mist-500">Top {highlight} go through to the knockouts.</p>}
    </div>
  );
}

function ScoreBox({ value, onChange, editable, label }) {
  if (!editable) return <span className="w-8 text-center font-display text-lg font-bold tabular-nums">{Number.isFinite(value) ? value : "–"}</span>;
  return (
    <input
      inputMode="numeric"
      aria-label={label}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, "").slice(0, 2);
        onChange(v === "" ? null : Number(v));
      }}
      placeholder="–"
      className="h-9 w-10 rounded-xl bg-white/[.07] text-center font-display text-lg font-bold tabular-nums ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/60"
    />
  );
}

function MatchRow({ t, id, home, away, homeLabel, awayLabel, editable, setScore }) {
  const s = t.scores[id] ?? {};
  const ready = Boolean(home && away);
  const result = T.played(s) ? (s.h > s.a ? "h" : s.h < s.a ? "a" : "d") : null;
  return (
    <div className="flex items-center gap-2 py-2">
      <span className={cn("min-w-0 flex-1 truncate text-right text-sm", result === "h" && "font-bold", !home && "text-mist-500 italic")}>{home ? T.teamName(t, home) : homeLabel}</span>
      <ScoreBox editable={editable && ready} value={s.h} onChange={(v) => setScore(id, { h: v })} label="Home score" />
      <span className="text-mist-700">:</span>
      <ScoreBox editable={editable && ready} value={s.a} onChange={(v) => setScore(id, { a: v })} label="Away score" />
      <span className={cn("min-w-0 flex-1 truncate text-sm", result === "a" && "font-bold", !away && "text-mist-500 italic")}>{away ? T.teamName(t, away) : awayLabel}</span>
    </div>
  );
}

function Fixtures({ t, fixtures, editable, setScore, compact }) {
  const rounds = useMemo(() => {
    const map = new Map();
    for (const f of fixtures) map.set(f.round, [...(map.get(f.round) ?? []), f]);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [fixtures]);
  return (
    <div className={cn("space-y-2", !compact && "space-y-3")}>
      {rounds.map(([round, list]) => (
        <div key={round} className="rounded-3xl bg-white/[.03] px-4 py-2 ring-1 ring-white/[.07]">
          <p className="pt-1 font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">{compact ? `Matchday ${round}` : `Round ${round}`}</p>
          <div className="divide-y divide-white/[.04]">
            {list.map((f) => (
              <MatchRow key={f.id} t={t} id={f.id} home={f.home} away={f.away} editable={editable} setScore={setScore} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TieCard({ t, tie, memo, editable, setScore, title }) {
  const r = T.resolveTie(t, tie, memo);
  const last = r.legs.at(-1);
  const pens = last && t.scores[last.id];
  return (
    <div className="w-72 shrink-0 rounded-3xl bg-white/[.03] p-3 ring-1 ring-white/[.07]">
      <div className="flex items-center justify-between px-1">
        <p className="font-mono text-[10px] tracking-[.18em] text-mist-500 uppercase">{title}</p>
        {r.winner && !r.bye && <span className="text-[11px] font-semibold text-signal">{T.teamName(t, r.winner)} through</span>}
      </div>
      {r.bye ? (
        <p className="px-1 py-3 text-sm">
          <b>{r.a.bye ? r.b.label : r.a.label}</b> <span className="text-mist-500">gets a bye</span>
        </p>
      ) : (
        <>
          {r.legs.map((leg) => (
            <div key={leg.id}>
              {r.legs.length > 1 && <p className="mt-1 px-1 text-[10px] text-mist-500">Leg {leg.n}</p>}
              <MatchRow t={t} id={leg.id} home={leg.home.id} away={leg.away.id} homeLabel={leg.home.label} awayLabel={leg.away.label} editable={editable} setScore={setScore} />
            </div>
          ))}
          {r.legs.length > 1 && r.legs.every((l) => T.played(t.scores[l.id])) && (
            <p className="px-1 text-xs text-mist-500">
              Aggregate {T.teamName(t, r.a.id)} {r.aggA}–{r.aggB} {T.teamName(t, r.b.id)}
            </p>
          )}
          {r.needsPens && (
            <div className="mt-1 flex items-center gap-2 rounded-2xl bg-amber-400/10 px-2 py-1.5 ring-1 ring-amber-300/30">
              <span className="flex-1 text-right text-xs font-semibold text-amber-200">Penalties</span>
              <ScoreBox editable={editable} value={pens?.ph} onChange={(v) => setScore(last.id, { ph: v })} label="Home penalties" />
              <span className="text-mist-700">:</span>
              <ScoreBox editable={editable} value={pens?.pa} onChange={(v) => setScore(last.id, { pa: v })} label="Away penalties" />
              <span className="flex-1" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Bracket({ t, editable, setScore }) {
  const memo = new Map();
  if (!t.ko) return null;
  return (
    <div>
      {t.format !== "cup" && !T.groupsDone(t) && <p className="mb-3 rounded-2xl bg-white/[.04] px-4 py-2.5 text-xs text-mist-500">The knockout teams appear once every group match has a score.</p>}
      <div className="-mx-4 overflow-x-auto px-4 pb-3">
        <div className="flex w-max gap-4">
          {t.ko.rounds.map((round) => (
            <div key={round.name} className="flex flex-col justify-around gap-3">
              <p className="font-display text-[15px] font-bold">{round.name}</p>
              {round.ties.map((tie, i) => (
                <TieCard key={tie.id} t={t} tie={tie} memo={memo} editable={editable} setScore={setScore} title={round.ties.length === 1 ? round.name : `${round.name.replace("-finals", "-final").replace("Round of", "R")} ${i + 1}`} />
              ))}
            </div>
          ))}
          {t.ko.third && (
            <div className="flex flex-col justify-end gap-3">
              <p className="font-display text-[15px] font-bold">Third place</p>
              <TieCard t={t} tie={t.ko.third} memo={memo} editable={editable} setScore={setScore} title="Third-place match" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

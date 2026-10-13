import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Check, Copy, Lock, Plus, Share2, Sparkles, Target, Users, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, PlayerChip } from "./ui";

/*
 * Match Predictor: call the result (and optionally the exact score) before kickoff.
 * Result right = 3 points, exact score = 3 more, and big matches count double or triple.
 * Predictions lock at kickoff (the server checks); finished matches are scored when you open this page.
 */

const TABS = [
  ["predict", "Predict"],
  ["mine", "My picks"],
  ["leagues", "Friends leagues"],
];

const PICKS = [
  ["H", "Home"],
  ["D", "Draw"],
  ["A", "Away"],
];

const key = (p) => `${p.league}_${p.matchId ?? p.id}`;

export function Predictor() {
  const [tab, setTab] = useState("predict");
  const [params, setParams] = useSearchParams();
  const joinCode = params.get("league");

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>
      <GameArt id="predictor" fit="meet" className="mb-5 h-32 rounded-3xl ring-1 ring-white/10" />
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Match Predictor</h1>
        <p className="text-sm text-mist-500">3 points for the result, 3 more for the exact score. Big matches count extra.</p>
      </div>

      {joinCode && <JoinBanner code={joinCode} onDone={() => (setParams({}, { replace: true }), setTab("leagues"))} />}

      <div className="mt-6 inline-flex gap-1 rounded-full bg-white/[.03] p-1 ring-1 ring-white/[.06]">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={cn("relative h-9 rounded-full px-4 text-[13px] font-semibold transition", tab === id ? "text-ink-950" : "text-mist-500 hover:text-mist-100")}>
            {tab === id && <motion.span layoutId="pred-tab" className="absolute inset-0 rounded-full bg-mist-100" transition={{ type: "spring", stiffness: 450, damping: 36 }} />}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "predict" && <PredictTab />}
        {tab === "mine" && <MineTab />}
        {tab === "leagues" && <LeaguesTab />}
      </div>
    </div>
  );
}

/* ---------- predict ---------- */

function PredictTab() {
  const [data, setData] = useState(null);
  const [mine, setMine] = useState({});
  const [error, setError] = useState("");
  const [competition, setCompetition] = useState("all");

  useEffect(() => {
    let live = true;
    Promise.all([gamesApi("pred.fixtures"), gamesApi("pred.mine")])
      .then(([f, m]) => {
        if (!live) return;
        setData(f);
        setMine(Object.fromEntries(m.open.map((p) => [key(p), p])));
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, []);

  const leagues = useMemo(() => [...new Map((data?.fixtures ?? []).map((f) => [f.league, f.leagueName])).entries()], [data]);
  const shown = (data?.fixtures ?? []).filter((f) => competition === "all" || f.league === competition);
  const days = useMemo(() => {
    const groups = new Map();
    for (const f of shown) {
      const label = new Date(f.kickoff).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
      groups.set(label, [...(groups.get(label) ?? []), f]);
    }
    return [...groups.entries()];
  }, [shown]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data)
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-28 rounded-3xl" />
        ))}
      </div>
    );

  return (
    <div>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[["all", "All"], ...leagues].map(([id, name]) => (
          <button key={id} onClick={() => setCompetition(id)} className={cn("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition", competition === id ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-500 ring-white/10 hover:text-mist-100")}>
            {name}
          </button>
        ))}
      </div>

      {days.length === 0 && <p className="rounded-2xl bg-white/[.03] px-4 py-8 text-center text-sm text-mist-500">No upcoming matches to predict right now.</p>}
      <div className="space-y-8">
        {days.map(([label, list]) => (
          <section key={label}>
            <Eyebrow className="mb-3">{label}</Eyebrow>
            <div className="space-y-3">
              {list.map((f) => (
                <FixtureCard key={key(f)} fixture={f} saved={mine[key(f)]} onSaved={(p) => setMine((m) => ({ ...m, [key(f)]: { ...p } }))} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Crest({ src, name }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="grid size-9 place-items-center rounded-full bg-white/10 font-mono text-[10px] font-bold">{name.slice(0, 3).toUpperCase()}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="size-9 object-contain" />;
}

function FixtureCard({ fixture: f, saved, onSaved }) {
  const [pick, setPick] = useState(saved?.pick ?? null);
  const [hs, setHs] = useState(saved?.hs ?? "");
  const [as, setAs] = useState(saved?.as ?? "");
  const [state, setState] = useState(saved ? "saved" : "idle"); // idle | saving | saved
  const [error, setError] = useState("");
  const locked = new Date(f.kickoff) <= Date.now();
  const { refresh } = useGames();

  const save = useCallback(
    async (nextPick, nextHs, nextAs) => {
      setState("saving");
      setError("");
      try {
        const scoreGiven = nextHs !== "" && nextAs !== "";
        await gamesApi("pred.place", { league: f.league, date: f.date, id: f.id, pick: nextPick, ...(scoreGiven ? { homeScore: Number(nextHs), awayScore: Number(nextAs) } : {}) });
        onSaved({ league: f.league, matchId: f.id, pick: nextPick, hs: scoreGiven ? Number(nextHs) : null, as: scoreGiven ? Number(nextAs) : null });
        setState("saved");
        if (!saved) refresh();
      } catch (err) {
        setError(err.message);
        setState("idle");
      }
    },
    [f, onSaved, saved, refresh],
  );

  const choose = (p) => {
    if (locked) return;
    setPick(p);
    // A score that no longer fits the pick is dropped.
    const fits = hs !== "" && as !== "" && (p === "H" ? +hs > +as : p === "A" ? +hs < +as : +hs === +as);
    if (!fits) {
      setHs("");
      setAs("");
    }
    save(p, fits ? hs : "", fits ? as : "");
  };

  const onScore = (nextHs, nextAs) => {
    setHs(nextHs);
    setAs(nextAs);
    if (pick && nextHs !== "" && nextAs !== "") {
      const ok = pick === "H" ? +nextHs > +nextAs : pick === "A" ? +nextHs < +nextAs : +nextHs === +nextAs;
      if (ok) save(pick, nextHs, nextAs);
      else setError("That score doesn't match your pick.");
    }
  };

  return (
    <Card className="!p-4 sm:!p-5">
      <div className="flex items-center justify-between text-[12px] text-mist-500">
        <span>{f.leagueName}</span>
        <span className="flex items-center gap-2">
          {f.event && (
            <span className="inline-flex items-center gap-1 rounded-full bg-signal/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-signal">
              <Sparkles className="size-3" /> {f.event.label} ×{f.event.mult}
            </span>
          )}
          {new Date(f.kickoff).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Crest src={f.home.logo} name={f.home.name} />
          <span className="truncate text-sm font-semibold">{f.home.short}</span>
        </div>
        <span className="font-mono text-xs text-mist-700">vs</span>
        <div className="flex min-w-0 flex-row-reverse items-center gap-2.5 text-right">
          <Crest src={f.away.logo} name={f.away.name} />
          <span className="truncate text-sm font-semibold">{f.away.short}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {PICKS.map(([id, label]) => (
          <button key={id} disabled={locked} onClick={() => choose(id)} className={cn("h-11 rounded-2xl text-sm font-semibold ring-1 transition", pick === id ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.04] ring-white/[.08] hover:bg-white/[.08]", locked && "opacity-50")}>
            {label}
          </button>
        ))}
      </div>

      {pick && !locked && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-mist-500">
            <span>Exact score (optional, +3):</span>
            <ScoreInput value={hs} onChange={(v) => onScore(v, as)} label={`${f.home.short} goals`} />
            <span>–</span>
            <ScoreInput value={as} onChange={(v) => onScore(hs, v)} label={`${f.away.short} goals`} />
          </div>
          <span className="flex items-center gap-1 text-xs">
            {state === "saving" && <Spinner className="size-3.5 text-mist-500" />}
            {state === "saved" && (
              <>
                <Check className="size-3.5 text-signal" /> <span className="text-signal">Saved</span>
              </>
            )}
          </span>
        </div>
      )}
      {locked && <p className="mt-3 flex items-center gap-1.5 text-xs text-mist-500"><Lock className="size-3" /> Predictions closed at kickoff</p>}
      {error && <p className="mt-2 text-xs text-live">{error}</p>}
    </Card>
  );
}

function ScoreInput({ value, onChange, label }) {
  return (
    <input
      type="number"
      min="0"
      max="20"
      inputMode="numeric"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value.slice(0, 2))}
      className="h-8 w-11 rounded-lg bg-white/[.06] text-center font-mono text-sm text-mist-100 ring-1 ring-white/10 outline-none focus:ring-signal/60"
    />
  );
}

/* ---------- my picks ---------- */

function MineTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const { rewarded, refresh } = useGames();

  useEffect(() => {
    let live = true;
    gamesApi("pred.mine")
      .then((d) => {
        if (!live) return;
        setData(d);
        if (d.justSettled?.length) refresh();
      })
      .catch((err) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [rewarded, refresh]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="skeleton h-40 rounded-3xl" />;

  const pickLabel = { H: "Home win", D: "Draw", A: "Away win" };
  return (
    <div className="space-y-8">
      {data.justSettled?.length > 0 && (
        <div className="rounded-3xl bg-signal/10 p-4 ring-1 ring-signal/30">
          <p className="font-semibold text-signal">Just scored: +{data.justSettled.reduce((n, p) => n + p.points, 0)} points</p>
        </div>
      )}
      <section>
        <Eyebrow className="mb-3">Waiting for kickoff / full time ({data.open.length})</Eyebrow>
        {data.open.length === 0 ? (
          <p className="rounded-2xl bg-white/[.03] px-4 py-6 text-center text-sm text-mist-500">No open predictions. Pick some matches on the Predict tab.</p>
        ) : (
          <div className="space-y-2">
            {data.open.map((p) => (
              <Card key={p.id} className="!flex !items-center !justify-between !gap-3 !p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {p.home} vs {p.away}
                  </p>
                  <p className="text-xs text-mist-500">
                    {pickLabel[p.pick]}
                    {p.hs != null && ` · ${p.hs}–${p.as}`} · {new Date(p.kickoff).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {p.mult > 1 && <span className="rounded-full bg-signal/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-signal">×{p.mult}</span>}
              </Card>
            ))}
          </div>
        )}
      </section>
      <section>
        <Eyebrow className="mb-3">Scored</Eyebrow>
        {data.settled.length === 0 ? (
          <p className="rounded-2xl bg-white/[.03] px-4 py-6 text-center text-sm text-mist-500">Nothing scored yet.</p>
        ) : (
          <div className="space-y-2">
            {data.settled.map((p) => (
              <Card key={p.id} className="!flex !items-center !justify-between !gap-3 !p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {p.home} {p.finalHome}–{p.finalAway} {p.away}
                  </p>
                  <p className="text-xs text-mist-500">
                    You said {pickLabel[p.pick]}
                    {p.hs != null && ` (${p.hs}–${p.as})`}
                  </p>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1 rounded-full px-3 py-1 font-display text-sm font-bold", p.points > 0 ? "bg-signal/15 text-signal" : "bg-white/[.06] text-mist-500")}>
                  {p.points > 0 ? <Check className="size-3.5" /> : <X className="size-3.5" />} {p.points}
                  {p.exact && " ★"}
                </span>
              </Card>
            ))}
          </div>
        )}
      </section>
      <Link to="/games/leaderboard?board=predWeekly" className="block text-center text-sm font-semibold text-signal">
        See this week's prediction leaderboard →
      </Link>
    </div>
  );
}

/* ---------- friends leagues ---------- */

function JoinBanner({ code, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function join() {
    setBusy(true);
    try {
      await gamesApi("pred.joinLeague", { code });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-3xl bg-signal/10 p-4 ring-1 ring-signal/30">
      <Users className="size-5 text-signal" />
      <p className="flex-1 text-sm font-semibold">You were invited to a league ({code}).</p>
      <Button size="sm" onClick={join} loading={busy}>
        Join league
      </Button>
      {error && <p className="w-full text-xs text-live">{error}</p>}
    </div>
  );
}

function LeaguesTab() {
  const [leagues, setLeagues] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const { refresh } = useGames();

  const load = useCallback(() => gamesApi("pred.leagues").then((d) => setLeagues(d.leagues)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (what, action, body) => {
    setBusy(what);
    setError("");
    try {
      await gamesApi(action, body);
      setName("");
      setCode("");
      await load();
      refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="!p-4">
          <p className="text-sm font-semibold">Start a league</p>
          <div className="mt-3 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={28} placeholder="League name" aria-label="League name" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.06] px-3 text-sm ring-1 ring-white/10 outline-none focus:ring-signal/60" />
            <Button size="sm" onClick={() => run("create", "pred.createLeague", { name })} loading={busy === "create"} disabled={name.trim().length < 3}>
              <Plus className="size-4" /> Create
            </Button>
          </div>
        </Card>
        <Card className="!p-4">
          <p className="text-sm font-semibold">Join with a code</p>
          <div className="mt-3 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="ABC123" aria-label="League code" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.06] px-3 font-mono text-sm tracking-widest uppercase ring-1 ring-white/10 outline-none focus:ring-signal/60" />
            <Button size="sm" onClick={() => run("join", "pred.joinLeague", { code })} loading={busy === "join"} disabled={code.trim().length < 6}>
              Join
            </Button>
          </div>
        </Card>
      </div>
      <ErrorNote>{error}</ErrorNote>

      {!leagues ? (
        <div className="skeleton h-40 rounded-3xl" />
      ) : leagues.length === 0 ? (
        <p className="rounded-2xl bg-white/[.03] px-4 py-8 text-center text-sm text-mist-500">You're not in a league yet. Start one and send the code to your friends.</p>
      ) : (
        leagues.map((l) => <LeagueCard key={l.code} league={l} onLeave={() => run("leave", "pred.leaveLeague", { code: l.code })} />)
      )}
    </div>
  );
}

function LeagueCard({ league, onLeave }) {
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/games/predictor?league=${league.code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(league.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const share = async () => {
    const text = `Join my Dixon Watch prediction league "${league.name}" (code ${league.code})`;
    try {
      if (navigator.share) await navigator.share({ title: league.name, text, url: link });
      else await navigator.clipboard.writeText(`${text} ${link}`);
    } catch {
      /* cancelled */
    }
  };
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold tracking-tight">{league.name}</h3>
          <p className="mt-0.5 text-xs text-mist-500">{league.members.length} players</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[.06] px-3.5 font-mono text-sm font-semibold tracking-widest ring-1 ring-white/10 transition hover:bg-white/10">
            {league.code} {copied ? <Check className="size-3.5 text-signal" /> : <Copy className="size-3.5 text-mist-500" />}
          </button>
          <Button size="sm" variant="ghost" onClick={share}>
            <Share2 className="size-4" /> Invite
          </Button>
        </div>
      </div>
      <table className="mt-4 w-full text-sm tabular-nums">
        <thead>
          <tr className="font-mono text-[10.5px] tracking-wider text-mist-500 uppercase">
            <th className="w-8 py-2 text-left font-medium">#</th>
            <th className="py-2 text-left font-medium">Player</th>
            <th className="py-2 text-right font-medium">This week</th>
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[.05]">
          {league.members.map((m, i) => (
            <tr key={m.uid} className={m.me ? "bg-signal/[.05]" : ""}>
              <td className="py-2.5 font-mono text-[12px] text-mist-500">{i + 1}</td>
              <td className="py-2.5">
                <PlayerChip avatar={m.avatar} name={m.name} />
              </td>
              <td className="py-2.5 text-right text-mist-300">{m.wk}</td>
              <td className="py-2.5 text-right font-display font-bold">{m.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onLeave} className="mt-3 text-xs text-mist-500 transition hover:text-live">
        Leave league
      </button>
    </Card>
  );
}

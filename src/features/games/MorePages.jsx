import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Brain, CalendarCheck, Check, Coins, Crown, Flame, Grid3x3, Lock, Medal, PenLine, ShieldCheck, Spline, UserSearch, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi, THEME_COLORS } from "@/lib/games";
import { cn } from "@/lib/cn";
import { StatChip, useGames, XpBar } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, PlayerChip } from "./ui";

const Back = ({ to = "/games", children = "Games" }) => (
  <Link to={to} className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
    <ArrowLeft className="size-4" /> {children}
  </Link>
);

/* ---------- daily challenge ---------- */

export function DailyChallenge() {
  const { daily, profile, refresh } = useGames();
  useEffect(() => {
    refresh();
  }, [refresh]);

  const tasks = [
    { to: "/games/daily-quiz", icon: Brain, title: "Daily quiz", desc: "10 questions, the same for everyone today.", done: daily?.quizDone, score: daily?.quizScore },
    { to: "/games/daily-player", icon: UserSearch, title: "Mystery player", desc: "One player, six clues, one try.", done: daily?.guessDone, score: daily?.guessScore },
    { to: "/games/footle", icon: Spline, title: "Footle", desc: "Find the footballer in 8 tries.", done: daily?.footleDone, score: daily?.footleScore },
    { to: "/games/grid", icon: Grid3x3, title: "Club grid", desc: "Nine squares, two clubs each.", done: daily?.gridDone, score: daily?.gridScore },
  ];
  const finished = tasks.filter((t) => t.done).length;

  return (
    <div className="mx-auto max-w-2xl">
      <Back />
      <GameArt id="daily" fit="meet" className="mb-5 h-32 rounded-3xl ring-1 ring-white/10" />
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Daily challenge</h1>
        <p className="text-sm text-mist-500">New every day (UTC). Play any one to keep your streak, or finish all four.</p>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between">
          <Eyebrow>Today</Eyebrow>
          <span className="font-mono text-xs text-mist-300">{finished} / {tasks.length} done</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]">
          <motion.div className="h-full rounded-full bg-signal" animate={{ width: `${(finished / tasks.length) * 100}%` }} />
        </div>
        {profile && (
          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip icon={Flame} value={profile.streak} label="Day streak" />
            <StatChip icon={Medal} value={profile.bestStreak} label="Best streak" />
          </div>
        )}
      </Card>

      <div className="mt-4 space-y-3">
        {tasks.map((t) => (
          <Link key={t.to} to={t.to} className="group flex items-center gap-4 rounded-3xl bg-white/[.025] p-5 ring-1 ring-white/[.06] transition hover:bg-white/[.04] hover:ring-signal/40">
            <span className={cn("grid size-12 place-items-center rounded-2xl ring-1", t.done ? "bg-signal text-ink-950 ring-signal" : "bg-signal/10 text-signal ring-signal/25")}>{t.done ? <Check className="size-6" /> : <t.icon className="size-6" />}</span>
            <span className="flex-1">
              <span className="block font-display text-lg font-bold">{t.title}</span>
              <span className="block text-sm text-mist-500">{t.done ? `Done · ${t.score} pts` : t.desc}</span>
            </span>
          </Link>
        ))}
      </div>
      <Link to="/games/leaderboard?board=daily" className="mt-6 block text-center text-sm font-semibold text-signal">
        See today's board →
      </Link>
    </div>
  );
}

/* ---------- leaderboards ---------- */

const BOARDS = [
  ["weekly", "This week"],
  ["all", "All time"],
  ["daily", "Daily"],
  ["grid", "Club grid"],
  ["hiloWeekly", "Higher/Lower (week)"],
  ["hiloAll", "Higher/Lower (all)"],
  ["keepyWeekly", "Keepie-Uppie (week)"],
  ["keepyAll", "Keepie-Uppie (all)"],
  ["predWeekly", "Predictions (week)"],
  ["predAll", "Predictions (all)"],
];

export function Leaderboards() {
  const [params, setParams] = useSearchParams();
  const board = BOARDS.some(([id]) => id === params.get("board")) ? params.get("board") : "weekly";
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    gamesApi("lb.get", { board })
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [board]);

  const resets = data?.resetsInMs != null ? `${Math.floor(data.resetsInMs / 86_400_000)}d ${Math.floor((data.resetsInMs % 86_400_000) / 3_600_000)}h left` : null;

  return (
    <div className="mx-auto max-w-2xl">
      <Back />
      <div className="flex items-center gap-4">
        <span className="grid size-14 place-items-center rounded-3xl bg-signal/10 ring-1 ring-signal/25">
          <Medal className="size-7 text-signal" />
        </span>
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Leaderboards</h1>
          <p className="text-sm text-mist-500">Weekly boards reset every Monday, so everyone gets a fresh start.</p>
        </div>
      </div>

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {BOARDS.map(([id, label]) => (
          <button key={id} onClick={() => setParams({ board: id }, { replace: true })} className={cn("h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-semibold ring-1 transition", board === id ? "bg-signal/10 text-signal ring-signal/50" : "text-mist-500 ring-white/10 hover:text-mist-100")}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <ErrorNote>{error}</ErrorNote>
        {!data && !error && <div className="skeleton h-72 rounded-3xl" />}
        {data && (
          <>
            <div className="mb-3 flex items-center justify-between">
              <Eyebrow>{data.title}</Eyebrow>
              {resets && <span className="font-mono text-[11px] text-mist-500">{resets}</span>}
            </div>
            {data.entries.length === 0 ? (
              <p className="rounded-2xl bg-white/[.03] px-4 py-10 text-center text-sm text-mist-500">Nobody here yet. Be the first!</p>
            ) : (
              <ol className="divide-y divide-white/[.05] overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
                {data.entries.map((e) => (
                  <li key={e.uid} className={cn("flex items-center gap-3 px-4 py-3", e.me && "bg-signal/[.07]")}>
                    <span className={cn("w-7 text-center font-display text-lg font-bold", e.rank <= 3 ? "text-signal" : "text-mist-500")}>{e.rank <= 3 ? ["🥇", "🥈", "🥉"][e.rank - 1] : e.rank}</span>
                    <PlayerChip avatar={e.avatar} name={e.me ? `${e.name} (you)` : e.name} className="flex-1" />
                    <span className="font-display text-lg font-bold tabular-nums">{e.value.toLocaleString()}</span>
                    <span className="w-8 font-mono text-[10px] text-mist-500 uppercase">{data.unit}</span>
                  </li>
                ))}
              </ol>
            )}
            {data.me && !data.me.rank && (
              <p className="mt-3 text-center text-sm text-mist-500">
                You: {data.me.value.toLocaleString()} {data.unit} (outside the top 50)
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- profile, achievements and shop ---------- */

export function GameProfile() {
  const { profile, loading, error, setProfile } = useGames();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (profile) setName(profile.name);
  }, [profile?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(
    async (what, action, body) => {
      setBusy(what);
      setProblem("");
      try {
        const r = await gamesApi(action, body);
        setProfile(r.profile);
      } catch (err) {
        setProblem(err.message);
      } finally {
        setBusy("");
      }
    },
    [setProfile],
  );

  if (loading || !profile)
    return (
      <div className="grid place-items-center py-24">
        {error ? <ErrorNote>{error}</ErrorNote> : <Spinner className="size-6 text-signal" />}
      </div>
    );

  const unlocked = profile.achievements.filter((a) => a.unlockedAt).length;
  const stats = [
    ["Games played", profile.stats.games],
    ["Questions right", profile.stats.quizCorrect],
    ["Perfect quizzes", profile.stats.perfectQuizzes],
    ["Predictions", profile.stats.predictions],
    ["Exact scores", profile.stats.predExact],
    ["Battles won", `${profile.stats.battlesWon} / ${profile.stats.battles}`],
    ["Players guessed", profile.stats.guessWins],
    ["Best streak", `${profile.bestStreak} days`],
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <Back />
      <Card className="bg-gradient-to-br from-signal/[.08] to-transparent">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-20 place-items-center rounded-3xl bg-white/[.07] text-4xl ring-1 ring-white/10">{profile.avatar}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} aria-label="Display name" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.06] px-3 font-display text-lg font-bold ring-1 ring-white/10 outline-none focus:ring-signal/60" />
              <Button size="sm" variant="ghost" onClick={() => run("name", "profile.setName", { name })} loading={busy === "name"} disabled={name.trim() === profile.name || name.trim().length < 2}>
                Save
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatChip icon={Flame} value={profile.streak} label="Day streak" />
              <StatChip icon={Coins} value={profile.coins} label="Coins" />
              <StatChip icon={Crown} value={`Lv ${profile.level}`} label="Level" />
            </div>
          </div>
        </div>
        <div className="mt-5">
          <XpBar profile={profile} />
        </div>
        <ErrorNote>{problem}</ErrorNote>
      </Card>

      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/[.025] p-4 ring-1 ring-white/[.06]">
            <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-[11px] text-mist-500">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <Eyebrow className="mb-3">
          Achievements · {unlocked} / {profile.achievements.length}
        </Eyebrow>
        <div className="grid gap-2 sm:grid-cols-2">
          {profile.achievements.map((a) => (
            <div key={a.id} className={cn("flex items-center gap-3 rounded-2xl p-3.5 ring-1", a.unlockedAt ? "bg-signal/[.07] ring-signal/30" : "bg-white/[.02] opacity-60 ring-white/[.06]")}>
              <span className="grid size-11 place-items-center rounded-xl bg-white/[.07] text-2xl">{a.unlockedAt ? a.icon : <Lock className="size-4 text-mist-500" />}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{a.name}</span>
                <span className="block text-xs text-mist-500">{a.desc}</span>
              </span>
              <span className="font-mono text-[10px] text-mist-500">+{a.xp}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <Eyebrow className="mb-3">Shop · spend your coins</Eyebrow>
        <p className="mb-3 text-xs font-semibold text-mist-300">Avatars</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {profile.shop.avatars.map((a) => (
            <ShopItem key={a.id} owned={profile.owned.includes(a.id)} active={profile.avatar === a.id} cost={a.cost} coins={profile.coins} busy={busy === a.id} onBuy={() => run(a.id, "profile.buy", { kind: "avatar", id: a.id })} onEquip={() => run(a.id, "profile.equip", { kind: "avatar", id: a.id })}>
              <span className="text-3xl">{a.id}</span>
            </ShopItem>
          ))}
        </div>
        <p className="mt-5 mb-3 text-xs font-semibold text-mist-300">Colour themes</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {profile.shop.themes.map((t) => (
            <ShopItem key={t.id} owned={profile.owned.includes(t.id)} active={profile.theme === t.id} cost={t.cost} coins={profile.coins} busy={busy === t.id} onBuy={() => run(t.id, "profile.buy", { kind: "theme", id: t.id })} onEquip={() => run(t.id, "profile.equip", { kind: "theme", id: t.id })}>
              <span className="size-8 rounded-full ring-2 ring-white/20" style={{ background: THEME_COLORS[t.id] }} />
              <span className="mt-1 text-[11px] font-semibold">{t.name}</span>
            </ShopItem>
          ))}
        </div>
      </section>
    </div>
  );
}

function ShopItem({ owned, active, cost, coins, busy, onBuy, onEquip, children }) {
  const can = coins >= cost;
  return (
    <button
      onClick={owned ? onEquip : onBuy}
      disabled={busy || (!owned && !can)}
      className={cn("flex flex-col items-center rounded-2xl px-2 py-3 ring-1 transition", active ? "bg-signal/10 ring-signal/60" : "bg-white/[.03] ring-white/[.08] hover:bg-white/[.06]", !owned && !can && "opacity-50")}
    >
      {children}
      <span className="mt-2 flex items-center gap-1 font-mono text-[10px] text-mist-500">
        {busy ? <Spinner className="size-3" /> : active ? <span className="text-signal">Equipped</span> : owned ? "Equip" : <><Coins className="size-3" /> {cost}</>}
      </span>
    </button>
  );
}

/* ---------- write a question ---------- */

export function SubmitQuestion() {
  const { profile } = useGames();
  const [form, setForm] = useState({ text: "", options: ["", "", "", ""], answer: 0, difficulty: "medium", source: "" });
  const [state, setState] = useState("idle"); // idle | sending | sent
  const [error, setError] = useState("");

  const setOption = (i, v) => setForm((f) => ({ ...f, options: f.options.map((o, j) => (j === i ? v : o)) }));

  async function send(e) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      await gamesApi("q.submit", form);
      setState("sent");
    } catch (err) {
      setError(err.message);
      setState("idle");
    }
  }

  if (state === "sent")
    return (
      <div className="mx-auto max-w-lg">
        <Back />
        <Card className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-3xl bg-signal/10 ring-1 ring-signal/25">
            <Check className="size-7 text-signal" />
          </span>
          <h2 className="mt-4 font-display text-2xl font-bold">Thanks, {profile?.name}!</h2>
          <p className="mt-2 text-sm text-mist-500">Your question is waiting for review. Once it's approved it joins the quizzes and you earn 30 XP, 20 coins and the Contributor badge.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button
              onClick={() => {
                setForm({ text: "", options: ["", "", "", ""], answer: 0, difficulty: "medium", source: "" });
                setState("idle");
              }}
            >
              Write another
            </Button>
            <Link to="/games">
              <Button variant="ghost">Back</Button>
            </Link>
          </div>
        </Card>
      </div>
    );

  return (
    <div className="mx-auto max-w-xl">
      <Back />
      <GameArt id="submit" fit="meet" className="mb-5 h-32 rounded-3xl ring-1 ring-white/10" />
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Write a question</h1>
        <p className="text-sm text-mist-500">Make it factual and unambiguous. Approved questions earn XP and coins.</p>
      </div>

      <form onSubmit={send} className="mt-6 space-y-4">
        <Card className="space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-mist-300">Question</span>
            <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={3} maxLength={200} placeholder="Which club is nicknamed 'The Saints'?" className="mt-1.5 w-full resize-none rounded-2xl bg-white/[.05] px-4 py-3 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/60" />
          </label>
          <div>
            <span className="text-xs font-semibold text-mist-300">Answers (tap the circle for the correct one)</span>
            <div className="mt-1.5 space-y-2">
              {form.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" onClick={() => setForm({ ...form, answer: i })} aria-label={`Answer ${i + 1} is correct`} className={cn("grid size-9 shrink-0 place-items-center rounded-full ring-1 transition", form.answer === i ? "bg-signal text-ink-950 ring-signal" : "bg-white/[.05] text-transparent ring-white/15 hover:ring-white/30")}>
                    <Check className="size-4" />
                  </button>
                  <input value={o} onChange={(e) => setOption(i, e.target.value)} maxLength={60} placeholder={i === form.answer ? "Correct answer" : `Wrong answer ${i + 1}`} className="h-11 min-w-0 flex-1 rounded-xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/60" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["easy", "medium", "hard"].map((d) => (
              <button key={d} type="button" onClick={() => setForm({ ...form, difficulty: d })} className={cn("rounded-xl py-2.5 text-sm font-semibold capitalize ring-1 transition", form.difficulty === d ? "bg-signal/10 text-signal ring-signal/60" : "bg-white/[.03] text-mist-300 ring-white/[.08]")}>
                {d}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-mist-300">Where can this be checked? (optional)</span>
            <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} maxLength={200} placeholder="e.g. Wikipedia: 2005 UEFA Champions League final" className="mt-1.5 h-11 w-full rounded-xl bg-white/[.05] px-4 text-[15px] ring-1 ring-white/10 outline-none placeholder:text-mist-700 focus:ring-signal/60" />
          </label>
        </Card>
        <ErrorNote>{error}</ErrorNote>
        <Button size="lg" type="submit" loading={state === "sending"} className="w-full">
          Send for review
        </Button>
        <p className="text-center text-xs text-mist-500">Questions are reviewed before anyone sees them. No links, please.</p>
      </form>
    </div>
  );
}

/* ---------- moderation (admins) ---------- */

export function Moderation() {
  const { profile } = useGames();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(() => gamesApi("q.pending").then((d) => setList(d.questions)).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  async function decide(id, approve) {
    setBusy(id);
    try {
      await gamesApi("q.decide", { id, approve });
      setList((l) => l.filter((q) => q.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  if (profile && !profile.admin)
    return (
      <div className="mx-auto max-w-md text-center">
        <ShieldCheck className="mx-auto size-10 text-mist-700" />
        <p className="mt-4 font-display text-xl font-bold">Admins only</p>
        <p className="mt-2 text-sm text-mist-500">Add your sign-in email to ADMIN_EMAILS to review questions.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-2xl">
      <Back />
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Review questions</h1>
      <p className="mt-1 text-sm text-mist-500">Check the answer is correct and the wording is clear before approving.</p>
      <div className="mt-6 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        {!list && !error && <div className="skeleton h-40 rounded-3xl" />}
        {list?.length === 0 && <p className="rounded-2xl bg-white/[.03] px-4 py-10 text-center text-sm text-mist-500">Nothing to review. 🎉</p>}
        {list?.map((q) => (
          <Card key={q.id}>
            <p className="font-semibold">{q.text}</p>
            <ul className="mt-3 space-y-1.5">
              {q.options.map((o, i) => (
                <li key={i} className={cn("rounded-xl px-3 py-2 text-sm ring-1", i === q.answer ? "bg-signal/10 text-signal ring-signal/40" : "bg-white/[.03] text-mist-300 ring-white/[.06]")}>
                  {o}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-mist-500">
              {q.difficulty} · by {q.byName}
              {q.source && ` · source: ${q.source}`}
            </p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => decide(q.id, true)} loading={busy === q.id}>
                <Check className="size-4" /> Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => decide(q.id, false)} disabled={busy === q.id}>
                <X className="size-4" /> Reject
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

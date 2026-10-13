import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Brain, PenLine, Swords, Target, UserPlus, Users } from "lucide-react";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { Card, ErrorNote, Eyebrow, PlayerChip } from "./ui";

/*
 * The games part of the Admin page, built from what the games store (no Live server needed):
 * players, activity today, predictions, battles and the question review queue.
 */

const n = (v) => (v == null ? "–" : v.toLocaleString());

/** The games part of the admin page: loads its own numbers, refreshes every 30 seconds. */
export function GamesSection() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = () =>
      gamesApi("admin.stats")
        .then((d) => live && (setData(d), setError("")))
        .catch((e) => live && setError(e.message));
    load();
    const timer = setInterval(load, 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const cards = data && [
    { icon: Users, label: "Players", value: data.players.total, sub: `${n(data.players.activeWeek)} active this week` },
    { icon: Activity, label: "Active today", value: data.players.activeToday, sub: `${n(data.players.newToday)} new today`, accent: true },
    { icon: Brain, label: "Quiz games today", value: data.activity.quizzesToday, sub: "quizzes and guess games" },
    { icon: Target, label: "Predictions today", value: data.activity.predictionsToday, sub: `${n(data.predictions.open)} open · ${n(data.predictions.settled)} scored` },
    { icon: Swords, label: "Battles today", value: data.activity.battlesToday, sub: `${n(data.activity.battlesFinished)} finished in total` },
    { icon: UserPlus, label: "Friends leagues", value: data.activity.leagues, sub: "created so far" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-[11px] text-mist-500">Updates every 30s · UTC day {data?.day ?? ""}</p>
      </div>

      <div className="mt-4 space-y-3">
        <ErrorNote>{error}</ErrorNote>
        {data?.store === "memory" && <ErrorNote>The games are on the temporary in-memory store, so these numbers reset on every restart. Add FIREBASE_SERVICE_ACCOUNT to keep real data.</ErrorNote>}
      </div>

      {!data && !error && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-28 rounded-3xl" />
          ))}
        </div>
      )}

      {data && (
        <>
          <Link
            to="/games/moderate"
            className={cn("mt-6 flex items-center gap-4 rounded-3xl p-5 ring-1 transition", data.questions.pending > 0 ? "bg-signal/[.08] ring-signal/40 hover:bg-signal/[.12]" : "bg-white/[.025] ring-white/[.06] hover:bg-white/[.04]")}
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-signal/10 ring-1 ring-signal/25">
              <PenLine className="size-6 text-signal" />
            </span>
            <span className="flex-1">
              <span className="block font-display text-lg font-bold">{data.questions.pending > 0 ? `${data.questions.pending} question${data.questions.pending === 1 ? "" : "s"} waiting for review` : "No questions waiting"}</span>
              <span className="block text-sm text-mist-500">
                {n(data.questions.approved)} approved from players · {n(data.questions.hidden)} hidden after reports
              </span>
            </span>
            <span className="text-sm font-semibold text-signal">Review →</span>
          </Link>

          <section className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cards.map((c) => (
              <div key={c.label} className={cn("rounded-3xl p-5 ring-1", c.accent ? "bg-gradient-to-br from-signal/[.1] to-transparent ring-signal/20" : "bg-white/[.025] ring-white/[.06]")}>
                <div className="flex items-center gap-2 text-mist-500">
                  <c.icon className="size-4" />
                  <span className="text-[12px] font-medium">{c.label}</span>
                </div>
                <p className="mt-3 font-display text-4xl font-extrabold tabular-nums">{n(c.value)}</p>
                <p className="mt-1 text-xs text-mist-500">{c.sub}</p>
              </div>
            ))}
          </section>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <Card className="!p-4">
              <Eyebrow className="mb-3">Newest players</Eyebrow>
              {data.recentPlayers.length === 0 ? (
                <p className="py-4 text-sm text-mist-500">Nobody has played yet.</p>
              ) : (
                <ul className="divide-y divide-white/[.05]">
                  {data.recentPlayers.map((p) => (
                    <li key={p.uid} className="flex items-center gap-3 py-2.5">
                      <PlayerChip avatar={p.avatar} name={p.name} level={p.level} className="flex-1" />
                      <span className="text-right text-xs text-mist-500">
                        {p.streak > 0 && <span className="mr-2 text-signal">🔥 {p.streak}</span>}
                        {p.createdAt ? new Date(p.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="!p-4">
              <Eyebrow className="mb-3">Top players (XP)</Eyebrow>
              {data.topPlayers.length === 0 ? (
                <p className="py-4 text-sm text-mist-500">No scores yet.</p>
              ) : (
                <ul className="divide-y divide-white/[.05]">
                  {data.topPlayers.map((p) => (
                    <li key={p.uid} className="flex items-center gap-3 py-2.5">
                      <span className="w-5 text-center font-mono text-xs text-mist-500">{p.rank}</span>
                      <PlayerChip avatar={p.avatar} name={p.name} className="flex-1" />
                      <span className="font-display font-bold tabular-nums">{n(p.xp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

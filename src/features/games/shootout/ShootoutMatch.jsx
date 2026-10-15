import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight, Circle, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { kickInfo, REGULATION } from "./geometry";
import { kitsFor, PenaltyScene } from "./PenaltyScene";

/*
 * One shootout on screen: the scoreboard, the penalty scene and whatever you have to do now
 * (take your kick, or pick a side in goal). New kicks are played out before the score moves.
 * Used by all three ways to play: against the computer, in the chat and live head to head.
 *
 * view = {
 *   me, players: [{ uid, name }], squads: { uid: { shooter, keeper } }, order, kicks, next,
 *   status, winner,
 *   action: "shoot" | "dive" | null     what you can do right now
 *   locked: "shot" | "dive" | null      (live) you've acted on this kick, waiting for them
 *   myDive: "L" | "C" | "R" | null      (chat) the side you picked for their next kick
 *   clock: { startsAt, endsAt } | null  (live) the shot clock
 * }
 * onShoot(shot, k) and onDive(zone, k) send your move.
 */

const SIDE = { L: "left", C: "the middle", R: "right" };

function savedCount(key) {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) && localStorage.getItem(key) !== null ? n : null;
  } catch {
    return null;
  }
}

export function ShootoutMatch({ view, onShoot, onDive, seenKey, children }) {
  const { me, kicks, order, status } = view;
  const opp = view.players.find((p) => p.uid !== me);
  const oppName = opp?.name ?? "Them";
  // How many kicks have been played out on this screen (the rest get a replay first).
  const [shown, setShown] = useState(() => {
    const saved = seenKey ? savedCount(seenKey) : null;
    if (saved !== null) return Math.min(saved, kicks.length);
    // First time here: show the kick the other player took against you, if that's the latest.
    return seenKey && kicks.length && kicks.at(-1).shooter !== me ? kicks.length - 1 : kicks.length;
  });
  const [myShots] = useState(() => new Set());
  const [choice, setChoice] = useState(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const now = useTicker(Boolean(view.clock));

  const replay = kicks.length > shown ? kicks[kicks.length - 1] : null;
  const finishReplay = () => {
    const n = replay ? replay.i + 1 : shown;
    setShown(n);
    setChoice(null);
    if (seenKey) {
      try {
        localStorage.setItem(seenKey, String(n));
      } catch {
        /* private mode */
      }
    }
  };

  async function shoot(shot) {
    const k = view.next?.i ?? kicks.length;
    myShots.add(k);
    setSending(true);
    setProblem("");
    try {
      await onShoot(shot, k);
    } catch (err) {
      myShots.delete(k);
      setProblem(err.message);
      setAttempt((a) => a + 1); // try the kick again
    } finally {
      setSending(false);
    }
  }

  async function lockDive() {
    if (!choice || sending) return;
    setSending(true);
    setProblem("");
    try {
      await onDive(choice, view.next?.i ?? kicks.length);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setSending(false);
    }
  }

  const waitingForClock = view.clock && now < view.clock.startsAt;
  let script;
  let kick;
  if (replay) {
    script = { type: "replay", kick: replay, from: myShots.has(replay.i) ? "strike" : "runup", onDone: finishReplay };
    kick = replay;
  } else if (status !== "playing") {
    script = { type: "idle" };
    kick = kicks.at(-1) ?? kickInfo(order, 0);
  } else {
    kick = view.next ?? kickInfo(order, kicks.length);
    if (waitingForClock) script = { type: "idle" };
    else if (view.action === "shoot") script = { type: "aim", onShoot: shoot };
    else if (view.locked === "shot") script = { type: "frozen" };
    else if (view.action === "dive") script = { type: "keep", value: choice, onPick: setChoice };
    else if (view.locked === "dive" || view.myDive) script = { type: "keep", value: view.myDive ?? choice, locked: true };
    else script = { type: "idle" };
  }

  const shooter = view.squads?.[kick.shooter]?.shooter;
  const keeper = view.squads?.[kick.keeper]?.keeper;
  const visible = kicks.slice(0, replay ? replay.i : shown);
  const done = status !== "playing" && !replay;
  const clockLeft = view.clock && !waitingForClock ? Math.max(0, Math.ceil((view.clock.endsAt - now) / 1000)) : null;

  let info = null;
  if (!replay && status === "playing") {
    if (waitingForClock) info = { text: kicks.length ? "Next kick coming up…" : `Kick-off in ${Math.max(1, Math.ceil((view.clock.startsAt - now) / 1000))}…` };
    else if (view.action === "shoot") info = { text: "Your kick: watch the run-up, then drag to aim and let go.", hot: true };
    else if (view.action === "dive") info = { text: choice ? `Diving ${SIDE[choice]}? Lock it in. ${oppName} can't see it.` : `You're in goal. Pick a side for ${oppName}'s kick.`, hot: true };
    else if (view.locked === "shot") info = { text: `Shot struck. Waiting for ${oppName} to pick a side…` };
    else if (view.locked === "dive" || view.myDive) info = { text: `You'll dive ${SIDE[view.myDive ?? choice] ?? "…"}. Waiting for ${oppName}'s kick…` };
    else info = { text: `Waiting for ${oppName}…` };
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3">
      <Scoreboard view={view} kicks={visible} clockLeft={clockLeft} current={replay ? replay.i : status === "playing" ? kicks.length : null} />

      <PenaltyScene
        key={`${attempt}`}
        yards={kick.yards}
        script={script}
        shooter={shooter}
        keeper={keeper}
        shooterKit={kitsFor(kick.shooter === me).shooter}
        keeperKit={kitsFor(kick.keeper === me).keeper}
        className="mx-auto w-full"
        style={{ maxWidth: "min(100%, calc((100dvh - 250px) * 0.75))" }}
      />

      {info && (
        <p className={cn("flex min-h-5 items-center justify-center gap-2 text-center text-sm", info.hot ? "font-semibold text-signal" : "text-white/70")}>
          {!info.hot && <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" />}
          {info.text}
        </p>
      )}

      {/* the keeper's choice */}
      {!replay && status === "playing" && view.action === "dive" && !waitingForClock && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2">
            {[["L", "Left", ArrowLeft], ["C", "Middle", Circle], ["R", "Right", ArrowRight]].map(([z, label, Icon]) => (
              <button key={z} onClick={() => setChoice(z)} aria-pressed={choice === z} className={cn("flex h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-bold ring-1 transition", choice === z ? "bg-amber-400/20 text-amber-200 ring-amber-300/70" : "bg-white/[.05] text-white/85 ring-white/10 hover:bg-white/[.09]")}>
                {z === "R" ? null : <Icon className="size-4" />}
                {label}
                {z === "R" ? <Icon className="size-4" /> : null}
              </button>
            ))}
          </div>
          <Button onClick={lockDive} disabled={!choice} loading={sending}>
            <Lock className="size-4" /> Lock in dive
          </Button>
        </div>
      )}
      {problem && <p className="text-center text-xs text-live">{problem}</p>}

      {done && <FinalCard view={view} oppName={oppName} />}
      {children}
    </div>
  );
}

function useTicker(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/* ---------- scoreboard ---------- */

function Scoreboard({ view, kicks, clockLeft, current }) {
  const { order, me } = view;
  const rounds = Math.max(REGULATION, Math.ceil(kicks.length / 2), current !== null ? Math.floor(current / 2) + 1 : 0);
  const name = (uid) => (uid === me ? "You" : view.players.find((p) => p.uid === uid)?.name ?? "Them");
  const goals = (uid) => kicks.filter((k) => k.shooter === uid && k.result === "goal").length;
  const next = current !== null ? kickInfo(order, current) : null;
  return (
    <div className="rounded-3xl bg-black/35 p-3 ring-1 ring-white/10 backdrop-blur">
      {order.map((uid, row) => {
        const mine = kicks.filter((k) => k.shooter === uid);
        return (
          <div key={uid} className={cn("flex items-center gap-2.5", row === 1 && "mt-2")}>
            <span className={cn("w-[4.6rem] shrink-0 truncate text-[13px] font-bold", uid === me ? "text-signal" : "text-white")}>{name(uid)}</span>
            <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden p-0.5">
              {Array.from({ length: rounds }).map((_, r) => {
                const k = mine[r];
                const upcoming = !k && next && next.shooter === uid && next.round === r;
                return (
                  <span key={r} className={cn("relative grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-black", r === REGULATION && "ml-1.5", k ? (k.result === "goal" ? "bg-signal text-ink-950" : "bg-rose-500 text-white") : upcoming ? "animate-pulse ring-2 ring-white" : "ring-1 ring-white/20")}>
                    {k ? (k.result === "goal" ? "✓" : "✕") : null}
                  </span>
                );
              })}
            </span>
            <span className="w-7 shrink-0 text-right font-display text-2xl leading-none font-extrabold tabular-nums">{goals(uid)}</span>
          </div>
        );
      })}
      {(next || clockLeft !== null) && (
        <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2 font-mono text-[10px] tracking-wider text-white/60 uppercase">
          <span>{next ? (next.sudden ? "Sudden death" : `Round ${next.round + 1} of ${REGULATION}`) : ""}</span>
          {clockLeft !== null && <span className={cn("rounded-full px-2 py-0.5 font-bold", clockLeft <= 5 ? "bg-live/20 text-live" : "bg-white/10 text-white")}>{clockLeft}s</span>}
        </div>
      )}
    </div>
  );
}

function FinalCard({ view, oppName }) {
  const ref = useRef(null);
  // On a phone the result sits below the pitch: bring it into view when the shootout ends.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const { me, kicks } = view;
  const won = view.winner === me;
  const draw = view.winner === "draw";
  const g = (uid) => kicks.filter((k) => k.shooter === uid && k.result === "goal").length;
  const oppUid = view.players.find((p) => p.uid !== me)?.uid;
  const sudden = kicks.length > REGULATION * 2;
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={cn("rounded-3xl p-5 text-center ring-1", won ? "bg-gradient-to-b from-amber-300/20 to-transparent ring-amber-300/40" : draw ? "bg-white/[.05] ring-white/10" : "bg-gradient-to-b from-rose-500/15 to-transparent ring-rose-400/30")}>
      <p className="font-mono text-[10px] tracking-[.2em] text-white/60 uppercase">{sudden ? "After sudden death" : "Full time"}</p>
      <h2 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight">{draw ? "It's a draw" : won ? "👑 You win the shootout!" : `✕ ${oppName} wins it`}</h2>
      <p className="mt-2 font-display text-5xl font-black tabular-nums">
        <span className={won ? "text-signal" : ""}>{g(me)}</span>
        <span className="mx-2 text-white/40">–</span>
        <span>{g(oppUid)}</span>
      </p>
    </motion.div>
  );
}

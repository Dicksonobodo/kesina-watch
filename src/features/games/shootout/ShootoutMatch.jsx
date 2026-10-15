import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/cn";
import { kickInfo, REGULATION } from "./geometry";
import { kitsFor, PenaltyScene } from "./PenaltyScene";

/*
 * One shootout, filling the space it's given (no scrolling): a one-line scoreboard on top and the
 * penalty scene below it. Everything you do happens on the pitch: drag to aim when it's your kick,
 * swipe the keeper when you're in goal. New kicks are played out before the score moves.
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
 * onShoot(shot, k) and onDive(zone, k) send your move. `final` is shown under the result at the end.
 */

const SIDE = { L: "left", C: "the middle", R: "right" };

function savedCount(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

export function ShootoutMatch({ view, onShoot, onDive, seenKey, final, className }) {
  const { me, kicks, order, status } = view;
  const opp = view.players.find((p) => p.uid !== me);
  const oppName = opp?.name ?? "Them";
  // How many kicks have been played out on this screen (the rest get a replay first).
  const [shown, setShown] = useState(() => {
    const saved = seenKey ? savedCount(seenKey) : null;
    if (saved !== null && Number.isFinite(saved)) return Math.min(saved, kicks.length);
    // First time here: show the kick the other player took against you, if that's the latest.
    return seenKey && kicks.length && kicks.at(-1).shooter !== me ? kicks.length - 1 : kicks.length;
  });
  const [myShots] = useState(() => new Set());
  const [choice, setChoice] = useState(null);
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
    setProblem("");
    try {
      await onShoot(shot, k);
    } catch (err) {
      myShots.delete(k);
      setProblem(err.message);
      setAttempt((a) => a + 1); // take the kick again
    }
  }

  // A swipe is the decision: the keeper is sent that way straight away.
  async function dive(zone) {
    if (choice) return;
    setChoice(zone);
    setProblem("");
    try {
      await onDive(zone, view.next?.i ?? kicks.length);
    } catch (err) {
      setChoice(null);
      setProblem(err.message);
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
    else if (view.action === "dive") script = { type: "keep", value: choice, onPick: dive };
    else if (view.locked === "dive" || view.myDive) script = { type: "keep", value: view.myDive ?? choice, locked: true };
    else script = { type: "idle" };
  }

  const shooter = view.squads?.[kick.shooter]?.shooter;
  const keeper = view.squads?.[kick.keeper]?.keeper;
  const visible = kicks.slice(0, replay ? replay.i : shown);
  const done = status !== "playing" && !replay;
  const clockLeft = view.clock && !waitingForClock && status === "playing" ? Math.max(0, Math.ceil((view.clock.endsAt - now) / 1000)) : null;

  let info = null;
  if (!replay && status === "playing") {
    if (waitingForClock) info = kicks.length ? "Next kick coming up…" : `Kick-off in ${Math.max(1, Math.ceil((view.clock.startsAt - now) / 1000))}…`;
    else if (view.action === "dive" && choice) info = `Diving ${SIDE[choice]}…`;
    else if (view.locked === "shot") info = `Shot struck. Waiting for ${oppName} to pick a side…`;
    else if (view.locked === "dive" || view.myDive) info = `You'll dive ${SIDE[view.myDive ?? choice] ?? "…"}. Waiting for ${oppName}'s kick…`;
    else if (!view.action) info = `Waiting for ${oppName}…`;
  }

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col gap-2", className)}>
      <Scoreboard view={view} kicks={visible} clockLeft={clockLeft} current={replay ? replay.i : status === "playing" ? kicks.length : null} />

      <PenaltyScene
        key={`${attempt}`}
        yards={kick.yards}
        script={script}
        shooter={shooter}
        keeper={keeper}
        shooterKit={kitsFor(kick.shooter === me).shooter}
        keeperKit={kitsFor(kick.keeper === me).keeper}
        className="min-h-[300px] flex-1 rounded-[24px] ring-1 ring-white/10"
      >
        {info && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <span className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-center text-[13px] font-semibold text-white ring-1 ring-white/15 backdrop-blur">
              <span className="size-2 shrink-0 animate-pulse rounded-full bg-signal" />
              {info}
            </span>
          </div>
        )}
        {problem && (
          <div className="absolute inset-x-0 bottom-16 flex justify-center px-4">
            <span className="rounded-full bg-live/90 px-3 py-1.5 text-xs font-semibold text-white">{problem}</span>
          </div>
        )}
        <AnimatePresence>
          {done && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[3px]">
              <div className="flex w-full max-w-sm flex-col gap-3">
                <FinalCard view={view} oppName={oppName} />
                {final}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PenaltyScene>
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

/* ---------- scoreboard: one line ---------- */

function Scoreboard({ view, kicks, clockLeft, current }) {
  const { order, me } = view;
  const rounds = Math.max(REGULATION, Math.ceil(kicks.length / 2), current !== null ? Math.floor(current / 2) + 1 : 0);
  const name = (uid) => (uid === me ? "You" : view.players.find((p) => p.uid === uid)?.name ?? "Them");
  const goals = (uid) => kicks.filter((k) => k.shooter === uid && k.result === "goal").length;
  const next = current !== null ? kickInfo(order, current) : null;
  const side = (uid, right) => {
    const mine = kicks.filter((k) => k.shooter === uid);
    return (
      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", right && "items-end")}>
        <span className={cn("max-w-full truncate text-[13px] leading-none font-bold", uid === me ? "text-signal" : "text-white")}>{name(uid)}</span>
        <span className={cn("flex gap-[3px]", right && "flex-row-reverse")}>
          {Array.from({ length: rounds }).map((_, r) => {
            const k = mine[r];
            const upcoming = !k && next && next.shooter === uid && next.round === r;
            return (
              <motion.span
                key={r}
                initial={false}
                animate={k ? { scale: [1.5, 1] } : { scale: 1 }}
                className={cn("grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] leading-none font-black", r === REGULATION && (right ? "mr-1" : "ml-1"), k ? (k.result === "goal" ? "bg-signal text-ink-950" : "bg-rose-500 text-white") : upcoming ? "animate-pulse border-2 border-white" : "border border-white/30")}
              >
                {k ? (k.result === "goal" ? "✓" : "✕") : null}
              </motion.span>
            );
          })}
        </span>
      </div>
    );
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/45 px-3 py-2 ring-1 ring-white/10 backdrop-blur">
      {side(order[0], false)}
      <div className="flex shrink-0 flex-col items-center">
        <span className="font-display text-[26px] leading-none font-black tabular-nums">
          {goals(order[0])}
          <span className="mx-1 text-white/35">–</span>
          {goals(order[1])}
        </span>
        <span className="mt-1 flex items-center gap-1.5 font-mono text-[9px] tracking-wider text-white/55 uppercase">
          {next ? (next.sudden ? "Sudden death" : `Round ${next.round + 1}/${REGULATION}`) : "Full time"}
          {clockLeft !== null && <span className={cn("rounded-full px-1.5 py-px font-bold", clockLeft <= 5 ? "bg-live/25 text-live" : "bg-white/10 text-white")}>{clockLeft}s</span>}
        </span>
      </div>
      {side(order[1], true)}
    </div>
  );
}

function FinalCard({ view, oppName }) {
  const { me, kicks } = view;
  const won = view.winner === me;
  const draw = view.winner === "draw";
  const g = (uid) => kicks.filter((k) => k.shooter === uid && k.result === "goal").length;
  const oppUid = view.players.find((p) => p.uid !== me)?.uid;
  const sudden = kicks.length > REGULATION * 2;
  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }} className={cn("rounded-3xl p-5 text-center ring-1 backdrop-blur", won ? "bg-gradient-to-b from-amber-300/30 to-black/70 ring-amber-300/50" : draw ? "bg-black/70 ring-white/15" : "bg-gradient-to-b from-rose-500/25 to-black/70 ring-rose-400/40")}>
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

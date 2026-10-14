import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Check, Copy, MessageCircle, RotateCcw, Share2, Swords, Trophy, Zap } from "lucide-react";
import { useChat } from "./chat/ChatProvider";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/cn";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { QuestionMeta } from "./QuizGame";
import { Card, ErrorNote, Eyebrow, OptionButton, PlayerChip } from "./ui";

/*
 * Head-to-head battles. Both players watch the same room: with a real database it updates live
 * (Firestore), in local development it is polled. The server holds the answers and the clock;
 * this page only shows the room and sends answers.
 */

/* ---------- lobby ---------- */

// What can be played head to head.
const BATTLE_GAMES = [
  { id: "quiz", title: "Football IQ quiz", desc: "Mixed football trivia", art: "quiz", levels: true },
  { id: "shirt", title: "Shirt numbers", desc: "Which number does he wear?", art: "shirt" },
  { id: "clubs", title: "Who played for both?", desc: "Two clubs, one player", art: "clubs" },
  { id: "trophy", title: "Name the trophy", desc: "Guess it from the clue", art: "trophy" },
  { id: "xi", title: "Complete the XI", desc: "Fill the missing players", art: "xi" },
];

export function BattleLobby() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile } = useGames();
  const [difficulty, setDifficulty] = useState("mixed");
  const [kind, setKind] = useState("quiz");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [friends, setFriends] = useState(null);
  const invite = params.get("room");

  useEffect(() => {
    gamesApi("battle.friends").then((d) => setFriends(d.friends)).catch(() => setFriends([]));
  }, []);

  const go = async (what, action, body) => {
    setBusy(what);
    setError("");
    try {
      const room = await gamesApi(action, body);
      navigate(`/games/battle/${room.code}`);
    } catch (err) {
      setError(err.message);
      setBusy("");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>
      <GameArt id="battle" fit="meet" className="mb-5 h-32 rounded-3xl ring-1 ring-white/10" />
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Head-to-Head</h1>
        <p className="text-sm text-mist-500">Same 10 questions, same clock. Faster answers score more.</p>
      </div>

      {invite && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-3xl bg-signal/10 p-4 ring-1 ring-signal/30">
          <Swords className="size-5 text-signal" />
          <p className="flex-1 text-sm font-semibold">A friend challenged you ({invite.toUpperCase()}).</p>
          <Button size="sm" onClick={() => go("invite", "battle.join", { code: invite })} loading={busy === "invite"}>
            Accept
          </Button>
        </div>
      )}

      {/* 1. pick the game */}
      <Eyebrow className="mt-6 mb-3">1 · Pick a game</Eyebrow>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {BATTLE_GAMES.map((g) => (
          <button
            key={g.id}
            onClick={() => setKind(g.id)}
            aria-pressed={kind === g.id}
            className={cn("overflow-hidden rounded-2xl text-left ring-1 transition", kind === g.id ? "ring-2 ring-signal" : "ring-white/[.08] hover:ring-white/25")}
          >
            <GameArt id={g.art} className={cn("h-20", kind !== g.id && "opacity-70")} />
            <span className="block px-3 py-2.5">
              <span className={cn("block text-[13px] leading-tight font-semibold", kind === g.id && "text-signal")}>{g.title}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-mist-500">{g.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {BATTLE_GAMES.find((g) => g.id === kind)?.levels && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[["easy", "Easy"], ["mixed", "Mixed"], ["medium", "Medium"], ["hard", "Hard"]].map(([id, label]) => (
            <button key={id} onClick={() => setDifficulty(id)} className={cn("rounded-2xl px-2 py-2.5 text-sm font-semibold ring-1 transition", difficulty === id ? "bg-signal/10 text-signal ring-signal/60" : "bg-white/[.03] text-mist-300 ring-white/[.08] hover:bg-white/[.06]")}>
              {label}
            </button>
          ))}
        </div>
      )}

      <Eyebrow className="mt-6 mb-3">2 · Find someone to play</Eyebrow>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col">
          <Zap className="size-6 text-signal" />
          <h3 className="mt-3 font-display text-lg font-bold">Quick match</h3>
          <p className="mt-1 flex-1 text-sm text-mist-500">We pair you with someone around your level{profile ? ` (you're level ${profile.level})` : ""} who picked the same game.</p>
          <Button className="mt-4" onClick={() => go("quick", "battle.quick", { difficulty, kind })} loading={busy === "quick"}>
            Find opponent
          </Button>
        </Card>
        <Card className="flex flex-col">
          <Swords className="size-6 text-signal" />
          <h3 className="mt-3 font-display text-lg font-bold">Challenge a friend</h3>
          <p className="mt-1 flex-1 text-sm text-mist-500">Make a private room and send them the code or link.</p>
          <Button className="mt-4" variant="ghost" onClick={() => go("create", "battle.create", { difficulty, kind })} loading={busy === "create"}>
            Create room
          </Button>
        </Card>
      </div>

      <Card className="mt-3 !p-4">
        <p className="text-sm font-semibold">Got a code?</p>
        <div className="mt-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="ABCDE" aria-label="Room code" className="h-10 min-w-0 flex-1 rounded-xl bg-white/[.06] px-3 font-mono text-sm tracking-widest uppercase ring-1 ring-white/10 outline-none focus:ring-signal/60" />
          <Button onClick={() => go("join", "battle.join", { code })} loading={busy === "join"} disabled={code.trim().length < 5}>
            Join
          </Button>
        </div>
      </Card>
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      <section className="mt-8">
        <Eyebrow className="mb-3">Your rivals</Eyebrow>
        {!friends ? (
          <div className="skeleton h-24 rounded-3xl" />
        ) : friends.length === 0 ? (
          <p className="rounded-2xl bg-white/[.03] px-4 py-6 text-center text-sm text-mist-500">Win and lose against people to build your friends ranking.</p>
        ) : (
          <div className="divide-y divide-white/[.05] overflow-hidden rounded-3xl bg-white/[.025] ring-1 ring-white/[.06]">
            {friends.map((f) => (
              <div key={f.uid} className="flex items-center gap-3 px-4 py-3">
                <PlayerChip avatar={f.avatar} name={f.name} className="flex-1" />
                <span className="font-mono text-sm tabular-nums">
                  <span className="text-signal">{f.wins}W</span> <span className="text-mist-500">{f.draws}D</span> <span className="text-live">{f.losses}L</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------- a room ---------- */

function useRoom(code, store) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const skew = useRef(0); // server clock minus this device's clock

  const apply = useCallback((r, now) => {
    if (now) skew.current = now - Date.now();
    setRoom(r);
  }, []);

  useEffect(() => {
    let stop = false;
    let unsub = null;
    let timer = null;
    const poll = async () => {
      try {
        const r = await gamesApi("battle.room", { code });
        if (!stop) apply(r.room, r.now);
      } catch (err) {
        if (!stop) setError(err.message);
      }
    };
    poll().then(() => {
      if (stop) return;
      if (store === "firestore" && db) {
        unsub = onSnapshot(
          doc(db, "rooms", code),
          (snap) => snap.exists() && setRoom(snap.data()),
          () => (timer = setInterval(poll, 1500)),
        );
      } else {
        timer = setInterval(poll, 1200);
      }
    });
    return () => {
      stop = true;
      unsub?.();
      clearInterval(timer);
    };
  }, [code, store, apply]);

  return { room, error, apply, skew };
}

function useNow(skew, every = 200) {
  const [now, setNow] = useState(() => Date.now() + skew.current);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + skew.current), every);
    return () => clearInterval(t);
  }, [skew, every]);
  return now;
}

export function BattleRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { store, refresh, profile } = useGames();
  const chat = useChat();
  const { room, error, apply, skew } = useRoom(code.toUpperCase(), store);
  const now = useNow(skew);
  const [chosen, setChosen] = useState({}); // question index → my choice
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const ticking = useRef(0);
  const myId = profile?.uid;
  // Complete the XI: names already revealed in earlier questions fill their places in the line-up.
  const filled = useMemo(() => {
    const out = {};
    for (const r of room?.reveals ?? []) {
      const q = room.qs[r.qi];
      if (q?.meta?.kind === "xi") out[q.meta.slot] = q.options[r.answer];
    }
    return out;
  }, [room?.reveals, room?.qs]);
  const oppId = room?.memberIds?.find((m) => m !== myId);
  const me = room?.players?.[myId];
  const opp = oppId ? room.players[oppId] : null;

  // When time is up, ask the server to move on (any player may; it's safe to repeat).
  useEffect(() => {
    if (room?.status !== "playing") return;
    const over = now > room.qStartedAt + room.seconds * 1000 + 2500;
    if (over && now - ticking.current > 1500) {
      ticking.current = now;
      gamesApi("battle.tick", { code: room.code }).then((r) => apply(r.room, r.now)).catch(() => {});
    }
  }, [room, now, apply]);

  useEffect(() => {
    if (room?.status === "done") refresh();
  }, [room?.status, refresh]);

  const answer = async (i) => {
    if (sending || chosen[room.idx] !== undefined) return;
    setChosen((c) => ({ ...c, [room.idx]: i }));
    setSending(true);
    try {
      const r = await gamesApi("battle.answer", { code: room.code, index: room.idx, choice: i });
      apply(r.room, r.now);
    } catch (err) {
      setProblem(err.message);
    } finally {
      setSending(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* blocked */
    }
  };

  const link = `${location.origin}/games/battle?room=${code}`;

  if (error && !room)
    return (
      <div className="mx-auto max-w-md space-y-4">
        <ErrorNote>{error}</ErrorNote>
        <Link to="/games/battle" className="text-sm text-signal">
          ← Back to battles
        </Link>
      </div>
    );
  if (!room)
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="size-6 text-signal" />
      </div>
    );

  /* waiting for an opponent */
  if (room.status === "waiting") {
    return (
      <div className="mx-auto max-w-md text-center">
        <Card>
          <Spinner className="mx-auto size-6 text-signal" />
          {room.title && <p className="mt-4 inline-block rounded-full bg-signal/10 px-3 py-1 font-mono text-[11px] font-semibold tracking-wider text-signal uppercase ring-1 ring-signal/30">{room.title}</p>}
          <h2 className="mt-3 font-display text-2xl font-bold">{room.public ? "Finding an opponent…" : "Waiting for your friend"}</h2>
          <p className="mt-2 text-sm text-mist-500">{room.public ? "Looking for someone around your level." : "Send them this code or link. The battle starts the moment they join."}</p>
          {room.public && now - room.createdAt > 45_000 && <p className="mt-3 text-sm text-mist-300">Nobody is online at your level right now. Cancel and challenge a friend with a code instead, or keep waiting.</p>}
          {!room.public && (
            <>
              <p className="mt-5 font-mono text-5xl font-bold tracking-[.25em] text-signal">{code}</p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="ghost" onClick={() => copy(code)}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />} Copy code
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      if (navigator.share) await navigator.share({ title: "Dixon Watch battle", text: "I challenge you to a football quiz battle!", url: link });
                      else await copy(link);
                    } catch {
                      /* cancelled */
                    }
                  }}
                >
                  <Share2 className="size-4" /> Share link
                </Button>
                <Button variant="ghost" onClick={() => chat.shareInvite({ code, title: room.title ?? "Football quiz" })}>
                  <MessageCircle className="size-4" /> Send in chat
                </Button>
              </div>
            </>
          )}
          <button
            onClick={async () => {
              await gamesApi("battle.cancel", { code }).catch(() => {});
              navigate("/games/battle");
            }}
            className="mt-6 text-sm text-mist-500 transition hover:text-live"
          >
            Cancel
          </button>
        </Card>
      </div>
    );
  }

  if (!me) return <ErrorNote>You're not part of this battle.</ErrorNote>;

  /* finished */
  if (room.status === "done") {
    const won = room.winner === myId;
    const draw = room.winner === "draw";
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Card className="text-center">
          <Trophy className={cn("mx-auto size-10", won ? "text-signal" : "text-mist-700")} />
          <h2 className="mt-3 font-display text-4xl font-extrabold tracking-tight">{draw ? "It's a draw" : won ? "You win!" : `${opp?.name ?? "Your opponent"} wins`}</h2>
          {room.forfeit && <p className="mt-1 text-sm text-mist-500">{room.forfeit === myId ? "You left the battle." : "Your opponent left the battle."}</p>}
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[me, opp].filter(Boolean).map((p, i) => (
              <div key={p.uid} className={cn("rounded-2xl p-4 ring-1", room.winner === p.uid ? "bg-signal/10 ring-signal/40" : "bg-white/[.03] ring-white/[.06]")}>
                <PlayerChip avatar={p.avatar} name={i === 0 ? "You" : p.name} level={p.level} className="justify-center" />
                <p className="mt-3 font-display text-4xl font-extrabold tabular-nums">{p.score}</p>
                <p className="text-xs text-mist-500">{p.correct} correct</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-mist-500">XP and coins have been added to your profile.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {room.rematch && room.rematch !== code ? (
              <Button onClick={async () => (await gamesApi("battle.join", { code: room.rematch }).catch(() => {}), navigate(`/games/battle/${room.rematch}`))}>
                <RotateCcw className="size-4" /> Join rematch
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  try {
                    const r = await gamesApi("battle.rematch", { code });
                    navigate(`/games/battle/${r.code}`);
                  } catch (err) {
                    setProblem(err.message);
                  }
                }}
              >
                <RotateCcw className="size-4" /> Rematch
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/games/battle")}>
              Leave
            </Button>
          </div>
        </Card>
        <ErrorNote>{problem}</ErrorNote>
      </div>
    );
  }

  /* playing */
  const q = room.qs[room.idx];
  const started = now >= room.qStartedAt;
  const lastReveal = room.reveals[room.reveals.length - 1];
  const showingReveal = !started && lastReveal && lastReveal.qi === room.idx - 1;
  const secondsLeft = Math.max(0, Math.ceil((room.qStartedAt + room.seconds * 1000 - now) / 1000));
  const myPick = chosen[room.idx];
  const oppAnswered = oppId && room.lastAnswered?.[oppId] === room.idx;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <ScoreBox p={me} you answered={myPick !== undefined || room.lastAnswered?.[myId] === room.idx} />
        <div className="text-center">
          <p className="font-mono text-[11px] tracking-wider text-mist-500 uppercase">
            Q {Math.min(room.idx + 1, room.qs.length)} / {room.qs.length}
          </p>
          <p className={cn("font-display text-3xl font-extrabold tabular-nums", started && secondsLeft <= 5 ? "text-live" : "")}>{started ? secondsLeft : "–"}</p>
        </div>
        <ScoreBox p={opp} answered={oppAnswered} right />
      </div>

      {showingReveal ? (
        <RevealView room={room} reveal={lastReveal} myId={myId} oppId={oppId} />
      ) : !started && room.idx === 0 ? (
        <Card className="mt-5 text-center">
          <p className="font-mono text-[11px] tracking-wider text-mist-500 uppercase">Get ready</p>
          <motion.p key={Math.ceil((room.qStartedAt - now) / 1000)} initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mt-2 font-display text-7xl font-extrabold text-signal">
            {Math.max(1, Math.ceil((room.qStartedAt - now) / 1000))}
          </motion.p>
          <p className="mt-2 text-sm text-mist-500">
            {me.name} vs {opp?.name}
          </p>
        </Card>
      ) : (
        <motion.div key={room.idx} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
          <Card>
            <QuestionMeta q={q} filled={filled} />
            <span className="rounded-full bg-white/[.06] px-2.5 py-1 font-mono text-[10px] tracking-wider text-mist-300 uppercase">{room.title ? `${room.title} · ` : ""}{q.category.replace(/-/g, " ")}</span>
            <h2 className="mt-4 font-display text-[clamp(20px,3.4vw,26px)] leading-snug font-bold tracking-tight text-balance">{q.text}</h2>
            <div className="mt-5 grid gap-2.5">
              {q.options.map((opt, i) => (
                <OptionButton key={i} index={i} label={opt} state={myPick === i ? "picked" : myPick !== undefined ? "dim" : "idle"} disabled={myPick !== undefined || !started} onClick={() => answer(i)} />
              ))}
            </div>
            {myPick !== undefined && <p className="mt-4 text-center text-sm text-mist-500">{oppAnswered ? "Revealing…" : `Waiting for ${opp?.name ?? "your opponent"}…`}</p>}
          </Card>
        </motion.div>
      )}
      <div className="mt-4">
        <ErrorNote>{problem}</ErrorNote>
      </div>
    </div>
  );
}

function ScoreBox({ p, answered, right, you }) {
  if (!p) return <div />;
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl bg-white/[.03] p-3 ring-1 ring-white/[.06]", right && "flex-row-reverse text-right")}>
      <PlayerChip avatar={p.avatar} name={you ? "You" : p.name} level={p.level} className={right ? "flex-row-reverse text-right" : ""} />
      <div className={cn("ml-auto", right && "mr-auto ml-0")}>
        <p className="font-display text-2xl font-extrabold tabular-nums">{p.score}</p>
        {answered && <p className="font-mono text-[10px] text-signal">answered</p>}
      </div>
    </div>
  );
}

function RevealView({ room, reveal, myId, oppId }) {
  const q = room.qs[reveal.qi];
  return (
    <Card className="mt-5">
      <h2 className="font-display text-lg leading-snug font-bold">{q.text}</h2>
      <div className="mt-4 grid gap-2">
        {q.options.map((opt, i) => {
          const mine = reveal.picks[myId]?.choice === i;
          const theirs = oppId && reveal.picks[oppId]?.choice === i;
          return (
            <div key={i} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ring-1", i === reveal.answer ? "bg-signal/15 text-signal ring-signal" : mine ? "bg-live/10 text-live ring-live/50" : "bg-white/[.03] text-mist-300 ring-white/[.06]")}>
              <span className="min-w-0 flex-1">{opt}</span>
              {mine && <span className="font-mono text-[10px] uppercase">you</span>}
              {theirs && <span className="font-mono text-[10px] uppercase">them</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-mist-500">
        You +{reveal.picks[myId]?.points ?? 0} · Them +{oppId ? reveal.picks[oppId]?.points ?? 0 : 0}
      </p>
    </Card>
  );
}

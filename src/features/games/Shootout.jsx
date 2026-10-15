import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bot, MessageCircle, RotateCcw, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { useChat } from "./chat/ChatProvider";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { Card, ErrorNote, Eyebrow, RewardCard } from "./ui";
import { ShootoutMatch } from "./shootout/ShootoutMatch";
import { squadPayload, SquadPicker, useSavedSquad } from "./shootout/SquadPicker";

/*
 * Mind Games: Shootout against the computer (the same game is in Head-to-Head, live, and in the
 * chat). The computer keeper learns your habits, so mix it up.
 */

const RULES = [
  ["🎯", "Shoot", "Watch the run-up, then drag the direction line to aim and let go."],
  ["🧤", "Keep", "Pick left, middle or right before the shot. Same side = saved."],
  ["📏", "Distance", "Kicks 1–2 from the spot, 3–4 from the edge of the box, 5 from 25 yards."],
  ["⚡", "Sudden death", "Level after five each? One kick each until someone misses."],
];

export function Shootout() {
  const { rewarded, toast } = useGames();
  const chat = useChat();
  const [squad, setSquad] = useSavedSquad();
  const [match, setMatch] = useState(null);
  const [reward, setReward] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setStarting(true);
    setError("");
    setReward(null);
    try {
      setMatch(await gamesApi("so.start", { squad: squadPayload(squad) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  async function play(body) {
    const r = await gamesApi("so.play", { session: match.session, ...body });
    setMatch(r);
    if (r.reward) {
      setReward(r.reward);
      rewarded(r.reward);
    }
    return r;
  }

  if (match) {
    const next = match.next;
    const view = {
      ...match,
      action: match.status === "playing" ? (next.shooter === match.me ? "shoot" : "dive") : null,
      locked: null,
      myDive: null,
      clock: null,
    };
    return (
      <div className="mx-auto max-w-md">
        <button onClick={() => setMatch(null)} className="mb-4 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
          <ArrowLeft className="size-4" /> Shootout
        </button>
        <ShootoutMatch key={match.session} view={view} onShoot={(shot) => play({ shot })} onDive={(zone) => play({ dive: zone })}>
          {match.status === "done" && (
            <ResultActions reward={reward} onAgain={start} starting={starting} onSquad={() => setMatch(null)} />
          )}
        </ShootoutMatch>
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>
      <Card className="overflow-hidden">
        <GameArt id="shootout" fit="meet" className="-mx-5 -mt-5 mb-6 h-48 sm:-mx-6 sm:-mt-6 sm:h-56" />
        <Eyebrow>Mind games</Eyebrow>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Shootout</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mist-500">One shoots, one keeps. Both pick a side in secret, then it's revealed. Guess right and it's saved; guess wrong and it's in. Five kicks each, then sudden death.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {RULES.map(([icon, title, text]) => (
            <div key={title} className="flex gap-3 rounded-2xl bg-white/[.03] p-3 ring-1 ring-white/[.06]">
              <span className="text-xl leading-none">{icon}</span>
              <span>
                <span className="block text-sm font-bold">{title}</span>
                <span className="block text-[12px] leading-snug text-mist-500">{text}</span>
              </span>
            </div>
          ))}
        </div>

        <Eyebrow className="mt-6 mb-2">Your squad</Eyebrow>
        <SquadPicker value={squad} onChange={setSquad} />

        <Button size="lg" className="mt-5 w-full" onClick={start} loading={starting}>
          <Bot className="size-5" /> Play the computer
        </Button>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link to="/games/battle?kind=shootout">
            <Button variant="ghost" className="w-full">
              <Swords className="size-4" /> Head-to-Head
            </Button>
          </Link>
          <Button
            variant="ghost"
            onClick={() => {
              chat.openPanel();
              toast({ title: "Shootout in the chat", body: "Pick a friend, then tap + and choose Shootout.", icon: "🥅" });
            }}
          >
            <MessageCircle className="size-4" /> In the chat
          </Button>
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-mist-500">
          <Users className="size-3.5" /> Head-to-Head is live, both of you at once. In the chat you take turns.
        </p>
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Card>
    </div>
  );
}

function ResultActions({ reward, onAgain, starting, onSquad }) {
  return (
    <div className="flex flex-col gap-3">
      {reward && <RewardCard reward={reward} />}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onAgain} loading={starting}>
          <RotateCcw className="size-4" /> Play again
        </Button>
        <Button className="flex-1" variant="ghost" onClick={onSquad}>
          Change squad
        </Button>
      </div>
    </div>
  );
}

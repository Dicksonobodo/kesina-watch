import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, MessageCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { useGames } from "../GamesProvider";
import { RewardCard } from "../ui";
import { useChat } from "./ChatProvider";
import { CHAT_GAMES } from "./gameInfo";

const WordSwipe = lazy(() => import("./WordSwipe"));
const Whot = lazy(() => import("./Whot"));
const Darts = lazy(() => import("./Darts"));
const SCREENS = { swipe: WordSwipe, whot: Whot, darts: Darts };

/*
 * A chat game, opened like an iMessage game: a sheet that slides up over the conversation, with
 * the game's own table behind it. When you finish your turn it is "Sent" and you're taken back
 * to the chat, where the new game bubble is waiting for the other player.
 */

export function GameHost() {
  const { gameId, setGameId, openPanel, backToChat, peer } = useChat();
  const { rewarded } = useGames();
  const [game, setGame] = useState(null);
  const [reward, setReward] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const vRef = useRef(-1);
  const alive = useRef(true);
  const moving = useRef(false);
  const timer = useRef(0);
  const sentTimer = useRef(0);
  const skew = useRef(0); // server clock minus this device's clock

  const apply = useCallback((g) => {
    if (!g) return;
    if (g.now) skew.current = g.now - Date.now();
    setGame((cur) => (cur && cur.id === g.id && cur.v > g.v ? cur : g));
    vRef.current = Math.max(vRef.current, g.v);
  }, []);

  useEffect(() => {
    if (!gameId) return;
    alive.current = true;
    setGame(null);
    setReward(null);
    setError("");
    setSent(false);
    vRef.current = -1;
    const loop = async () => {
      if (!alive.current) return;
      if (!moving.current) {
        try {
          const r = await gamesApi("cg.get", { id: gameId, v: vRef.current });
          if (alive.current && r.game) apply(r.game);
        } catch (err) {
          if (alive.current && err.status === 404) setError("That game isn't available any more.");
        }
      }
      if (alive.current) timer.current = setTimeout(loop, document.hidden ? 8000 : 1500);
    };
    loop();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearTimeout(sentTimer.current);
    };
  }, [gameId, apply]);

  const move = useCallback(
    async (body) => {
      moving.current = true;
      setBusy(true);
      setError("");
      try {
        const r = await gamesApi("cg.move", { id: gameId, ...body });
        apply(r.game);
        if (r.reward) {
          setReward(r.reward);
          rewarded(r.reward);
        }
        // Your turn is over and on its way: show "Sent", then go back to the conversation.
        if (r.sent && r.game.status === "playing") {
          clearTimeout(sentTimer.current);
          sentTimer.current = setTimeout(() => {
            setSent(true);
            sentTimer.current = setTimeout(() => backToChat(), 1600);
          }, body.do === "throw" ? 900 : 350);
        }
        return r;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        moving.current = false;
        setBusy(false);
      }
    },
    [gameId, apply, rewarded, backToChat],
  );

  async function again() {
    try {
      const r = await gamesApi("cg.rematch", { id: gameId });
      setReward(null);
      vRef.current = -1;
      setGame(null);
      setGameId(r.game.id);
    } catch (err) {
      setError(err.message);
    }
  }

  const info = CHAT_GAMES.find((g) => g.id === game?.type);
  const Screen = game ? SCREENS[game.type] : null;
  const opp = game?.players.find((p) => p.uid !== game.me);

  return (
    <AnimatePresence>
      {gameId && (
        <motion.div key="host" className="fixed inset-0 z-[130] flex flex-col bg-black/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="relative mt-[max(env(safe-area-inset-top),.6rem)] flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[28px] shadow-2xl ring-1 ring-white/10 sm:mx-auto sm:mt-6 sm:mb-6 sm:w-full sm:max-w-lg sm:rounded-[28px]"
            style={{ background: info?.table ?? "#0b0b10" }}
          >
            {/* the bar at the top, like an expanded iMessage app */}
            <div className="relative flex items-center gap-2 px-3 pt-2 pb-2">
              <span className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/25" />
              <button onClick={() => setGameId(null)} aria-label="Close game" className="mt-1 grid size-9 place-items-center rounded-full bg-black/30 text-white/90 transition hover:bg-black/50">
                <ChevronDown className="size-5" />
              </button>
              <div className="mt-1 flex min-w-0 flex-1 items-center justify-center gap-2">
                {info && (
                  <span className="grid size-7 place-items-center rounded-lg text-sm" style={{ background: info.color }}>
                    {info.emoji}
                  </span>
                )}
                <span className="min-w-0 text-center">
                  <span className="block truncate text-[15px] leading-tight font-bold">{game?.title ?? "Loading…"}</span>
                  <span className="block truncate text-[11px] leading-tight text-white/60">{opp ? `vs ${opp.name ?? peer?.name}` : ""}</span>
                </span>
              </div>
              <button
                onClick={() => {
                  setGameId(null);
                  openPanel();
                }}
                aria-label="Open chat"
                className="mt-1 grid size-9 place-items-center rounded-full bg-black/30 text-white/90 transition hover:bg-black/50"
              >
                <MessageCircle className="size-[18px]" />
              </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {!game && !error && (
                <div className="grid h-full place-items-center">
                  <Spinner className="size-6 text-signal" />
                </div>
              )}
              {error && !game && <p className="mx-auto mt-16 max-w-xs text-center text-sm text-live">{error}</p>}
              {game && Screen && (
                <Suspense fallback={<div className="grid h-full place-items-center"><Spinner className="size-6 text-signal" /></div>}>
                  <Screen game={game} move={move} busy={busy} error={error} skew={skew.current} info={info} />
                </Suspense>
              )}
            </div>

            {game?.status === "done" && (
              <div className="border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-md flex-col gap-3">
                  {reward && <RewardCard reward={reward} />}
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={again}>
                      <RotateCcw className="size-4" /> Rematch
                    </Button>
                    <Button className="flex-1" variant="ghost" onClick={backToChat}>
                      Back to chat
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* "Sent": your turn is on its way */}
            <AnimatePresence>
              {sent && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm" onClick={backToChat}>
                  <motion.div initial={{ scale: 0.8, y: 10 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 22 }} className="flex flex-col items-center px-8 text-center">
                    <span className="grid size-20 place-items-center rounded-full bg-signal text-ink-950 shadow-[0_0_60px_-10px_var(--color-signal)]">
                      <Check className="size-10" strokeWidth={3} />
                    </span>
                    <p className="mt-5 font-display text-3xl font-extrabold">Sent</p>
                    <p className="mt-1 text-sm text-white/70">Waiting for {opp?.name ?? "them"} to play</p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small shared piece: who won, for the top of a finished game. */
export function Banner({ game }) {
  if (game.status !== "done") return null;
  const won = game.winner === game.me;
  const opp = game.players.find((p) => p.uid !== game.me);
  return (
    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn("mx-auto mb-3 w-fit rounded-full px-5 py-2 font-display text-lg font-extrabold", game.winner === "draw" ? "bg-white/10" : won ? "bg-signal text-ink-950" : "bg-live/15 text-live")}>
      {game.winner === "draw" ? "It's a draw" : won ? "You won! 🎉" : `${opp?.name} won`}
    </motion.div>
  );
}

/** Shown when it's the other player's turn: their move will arrive in the chat. */
export function WaitingNote({ game }) {
  const opp = game.players.find((p) => p.uid !== game.me);
  return (
    <p className="flex items-center justify-center gap-2 text-sm text-white/70">
      <span className="size-2 animate-pulse rounded-full bg-signal" /> Waiting for {opp?.name} to play
    </p>
  );
}

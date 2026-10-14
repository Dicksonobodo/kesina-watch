import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, MessageCircle, RotateCcw } from "lucide-react";
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
 * A chat game played full screen. It loads the game, keeps it fresh by polling (quickly while
 * you're waiting for the other player), and hands moves to the server.
 */

export function GameHost() {
  const { gameId, setGameId, openPanel, peer } = useChat();
  const { rewarded } = useGames();
  const [game, setGame] = useState(null);
  const [reward, setReward] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const vRef = useRef(-1);
  const alive = useRef(true);
  const moving = useRef(false);
  const timer = useRef(0);
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
        return r;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        moving.current = false;
        setBusy(false);
      }
    },
    [gameId, apply, rewarded],
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

  if (!gameId) return null;
  const info = CHAT_GAMES.find((g) => g.id === game?.type);
  const Screen = game ? SCREENS[game.type] : null;
  const opp = game?.players.find((p) => p.uid !== game.me);
  const waitingOn = game && game.status === "playing" && game.turn && game.turn !== game.me;

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="fixed inset-0 z-[130] flex flex-col bg-ink-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center gap-2 border-b border-white/[.06] px-3 py-2.5">
        <button onClick={() => setGameId(null)} className="flex items-center gap-0.5 rounded-full py-1.5 pr-3 pl-1.5 text-[15px] font-semibold text-signal transition hover:bg-white/[.06]">
          <ChevronLeft className="size-5" /> Back
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] font-bold">{game?.title ?? "Loading…"}</p>
          <p className="truncate text-[11px] text-mist-500">{opp ? `with ${opp.name ?? peer?.name}` : ""}</p>
        </div>
        <button
          onClick={() => {
            setGameId(null);
            openPanel();
          }}
          aria-label="Open chat"
          className="grid size-9 place-items-center rounded-full bg-white/[.06] text-signal transition hover:bg-white/10"
        >
          <MessageCircle className="size-[18px]" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
        <div className="border-t border-white/[.06] bg-ink-900 px-4 py-3">
          <div className="mx-auto flex max-w-md flex-col gap-3">
            {reward && <RewardCard reward={reward} />}
            <div className="flex gap-2">
              <Button className="flex-1" onClick={again}>
                <RotateCcw className="size-4" /> Rematch
              </Button>
              <Button className="flex-1" variant="ghost" onClick={() => setGameId(null)}>
                Back to chat
              </Button>
            </div>
          </div>
        </div>
      )}
      {waitingOn && game.type !== "swipe" && <p className={cn("sr-only")}>Waiting for {opp?.name}</p>}
    </motion.div>
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

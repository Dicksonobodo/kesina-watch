import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { gamesApi } from "@/lib/games";
import { cn } from "@/lib/cn";
import { useGames } from "./GamesProvider";
import { GameArt } from "./art";
import { NamePicker } from "./NamePicker";
import { Card, ErrorNote, Eyebrow, RewardCard, shareResult } from "./ui";

/*
 * The daily club grid: in each square, name a player who played for both the row's club and the
 * column's club. Rarer players score more. 12 guesses to fill 9 squares; the same grid for everyone.
 */

const short = (name = "") => name.replace(/^(FC|AC|AS|SS)\s+/i, "");

export function ClubGrid() {
  const { rewarded, refresh } = useGames();
  const [grid, setGrid] = useState(null);
  const [names, setNames] = useState(null);
  const [cell, setCell] = useState(null); // "r,c" being filled
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reward, setReward] = useState(null);
  const [shared, setShared] = useState("");

  useEffect(() => {
    gamesApi("grid.get")
      .then(setGrid)
      .catch((e) => setError(e.message));
    gamesApi("career.names")
      .then((d) => setNames(d.names))
      .catch(() => {});
  }, []);

  const items = useMemo(() => (names ?? []).map((n) => ({ key: n, name: n })), [names]);
  const used = useMemo(() => new Set(Object.values(grid?.cells ?? {}).map((c) => c.name)), [grid]);

  async function pick(item) {
    if (!cell || busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await gamesApi("grid.guess", { cell, name: item.name });
      setGrid(r.grid);
      if (r.wrong) setNote(r.message);
      else {
        setNote("");
        setCell(null);
      }
      if (r.reward) {
        setReward(r.reward);
        rewarded(r.reward);
        refresh();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (grid.cells[`${r},${c}`] ? "🟩" : "⬛")).join("")).join("\n");
    setShared(await shareResult(`Dixon Watch club grid ${grid.day}\n${rows}\nScore ${grid.score}\n${window.location.origin}/games/grid`));
  }

  const filled = Object.keys(grid?.cells ?? {}).length;

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/games" className="mb-6 inline-flex items-center gap-2 text-sm text-mist-500 transition hover:text-mist-100">
        <ArrowLeft className="size-4" /> Games
      </Link>

      <Card className="overflow-hidden">
        <GameArt id="grid" fit="meet" className="-mx-5 -mt-5 mb-5 h-36 sm:-mx-6 sm:-mt-6" />
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Club grid</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-mist-500">In each square, name a player who played for <b className="text-mist-100">both</b> clubs. Rarer players score more. New grid every day.</p>

        {!grid && !error && (
          <div className="grid place-items-center py-16">
            <Spinner className="size-6 text-signal" />
          </div>
        )}

        {grid && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <Eyebrow>
                {filled} / 9 filled
              </Eyebrow>
              <span className="rounded-full bg-signal/10 px-3 py-1 font-mono text-xs font-semibold text-signal ring-1 ring-signal/30">{grid.guessesLeft} guesses left</span>
            </div>

            <div className="mt-3 grid grid-cols-[minmax(0,.8fr)_repeat(3,minmax(0,1fr))] gap-1.5">
              <div />
              {grid.cols.map((c) => (
                <div key={c.id} className="grid place-items-center rounded-xl bg-white/[.06] px-1 py-2.5 text-center text-[11px] leading-tight font-bold sm:text-xs">
                  {short(c.name)}
                </div>
              ))}
              {grid.rows.map((r, ri) => (
                <Row key={r.id} club={r} ri={ri} grid={grid} cell={cell} setCell={(k) => !grid.done && setCell(k)} />
              ))}
            </div>

            <AnimatePresence>
              {cell && !grid.done && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5">
                  <p className="mb-2 text-sm text-mist-300">
                    Who played for <b className="text-white">{grid.rows[Number(cell[0])].name}</b> and <b className="text-white">{grid.cols[Number(cell[2])].name}</b>?
                  </p>
                  <NamePicker items={items} exclude={used} onPick={pick} busy={busy} placeholder="Search a player" />
                </motion.div>
              )}
            </AnimatePresence>
            {!cell && !grid.done && <p className="mt-4 text-center text-sm text-mist-500">Tap a square to fill it.</p>}
            {note && <p className="mt-3 flex items-start gap-2 text-sm text-live"><X className="mt-0.5 size-4 shrink-0" /> {note}</p>}
          </>
        )}
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Card>

      {grid?.done && (
        <div className="mt-4 space-y-4">
          <Card className="text-center">
            <Eyebrow>{grid.perfect ? "Immaculate!" : "Grid finished"}</Eyebrow>
            <p className="mt-3 font-display text-6xl font-extrabold text-signal tabular-nums">{grid.score}</p>
            <p className="text-sm text-mist-500">points · {filled} of 9 squares</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={share}>
                <Share2 className="size-4" /> {shared === "copied" ? "Copied!" : "Share"}
              </Button>
              <Link to="/games/leaderboard?board=grid">
                <Button variant="ghost">Today's board</Button>
              </Link>
            </div>
            <p className="mt-4 text-xs text-mist-500">A new grid arrives tomorrow.</p>
          </Card>
          <RewardCard reward={reward} />
        </div>
      )}
    </div>
  );
}

function Row({ club, ri, grid, cell, setCell }) {
  return (
    <>
      <div className="grid place-items-center rounded-xl bg-white/[.06] px-1 py-2 text-center text-[11px] leading-tight font-bold sm:text-xs">{short(club.name)}</div>
      {[0, 1, 2].map((ci) => {
        const key = `${ri},${ci}`;
        const got = grid.cells[key];
        const selected = cell === key;
        return (
          <button
            key={key}
            onClick={() => !got && setCell(key)}
            disabled={Boolean(got) || grid.done}
            className={cn(
              "relative grid aspect-square min-h-16 place-items-center rounded-xl p-1 text-center ring-1 transition",
              got ? "bg-signal/15 ring-signal/50" : selected ? "bg-white/[.1] ring-2 ring-signal" : "bg-white/[.03] ring-white/[.08] hover:bg-white/[.07]",
            )}
          >
            {got ? (
              <>
                <Check className="absolute top-1 right-1 size-3 text-signal" />
                <span className="text-[10.5px] leading-tight font-semibold break-words">{got.name}</span>
                <span className="absolute bottom-1 font-mono text-[9px] text-signal">+{got.points}</span>
              </>
            ) : (
              <span className="text-xl text-mist-700">+</span>
            )}
          </button>
        );
      })}
    </>
  );
}

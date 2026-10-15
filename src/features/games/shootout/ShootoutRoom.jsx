import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { gamesApi } from "@/lib/games";
import { kickInfo } from "./geometry";
import { ShootoutMatch } from "./ShootoutMatch";

/*
 * Mind Games: Shootout live, in a Head-to-Head room. Both players act on the same kick at once:
 * one aims, the other picks a side, against a 15-second clock. The kick is played out on both
 * screens when the second choice arrives (or when the clock runs out).
 */

export function ShootoutRoom({ room, myId, now, skew, apply }) {
  const navigate = useNavigate();
  const [problem, setProblem] = useState("");
  const so = room.so;
  const k = room.idx;
  const done = room.status === "done";
  const next = done ? null : kickInfo(so.order, k);
  const started = now >= room.qStartedAt;
  const acted = room.lastAnswered?.[myId] === k;
  const shooting = next?.shooter === myId;
  const view = {
    me: myId,
    players: room.memberIds.map((uid) => ({ uid, name: room.players[uid]?.name })),
    squads: Object.fromEntries(room.memberIds.map((uid) => [uid, room.players[uid]?.squad])),
    order: so.order,
    kicks: so.kicks,
    next,
    status: room.status,
    winner: room.winner,
    action: !done && started && !acted ? (shooting ? "shoot" : "dive") : null,
    locked: !done && acted ? (shooting ? "shot" : "dive") : null,
    myDive: null,
    clock: done ? null : { startsAt: room.qStartedAt - skew, endsAt: room.qStartedAt + room.seconds * 1000 - skew },
  };

  const send = async (body) => {
    const r = await gamesApi("battle.kick", { code: room.code, k, ...body });
    apply(r.room, r.now);
    return r;
  };

  return (
    <div className="mx-auto max-w-md">
      <ShootoutMatch key={room.code} view={view} onShoot={(shot) => send({ shot })} onDive={(zone) => send({ zone })}>
        {done && (
          <div className="flex flex-col gap-2">
            {room.forfeit && <p className="text-center text-sm text-mist-500">{room.forfeit === myId ? "You stopped playing, so the shootout was given to your opponent." : "Your opponent stopped playing, so the shootout is yours."}</p>}
            <p className="text-center text-xs text-mist-500">XP and coins have been added to your profile.</p>
            <div className="flex gap-2">
              {room.rematch && room.rematch !== room.code ? (
                <Button className="flex-1" onClick={async () => (await gamesApi("battle.join", { code: room.rematch, squad: squadIds(room.players[myId]?.squad) }).catch(() => {}), navigate(`/games/battle/${room.rematch}`))}>
                  <RotateCcw className="size-4" /> Join rematch
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  onClick={async () => {
                    try {
                      const r = await gamesApi("battle.rematch", { code: room.code });
                      navigate(`/games/battle/${r.code}`);
                    } catch (err) {
                      setProblem(err.message);
                    }
                  }}
                >
                  <RotateCcw className="size-4" /> Rematch
                </Button>
              )}
              <Button className="flex-1" variant="ghost" onClick={() => navigate("/games/battle")}>
                Leave
              </Button>
            </div>
            {problem && <p className="text-center text-xs text-live">{problem}</p>}
          </div>
        )}
      </ShootoutMatch>
    </div>
  );
}

const squadIds = (squad) => (squad ? { shooter: squad.shooter?.id, keeper: squad.keeper?.id } : null);

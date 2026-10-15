import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ShootoutMatch } from "../shootout/ShootoutMatch";
import { squadPayload, SquadPicker, useSavedSquad } from "../shootout/SquadPicker";

/*
 * Mind Games: Shootout in the chat. Each go is: watch their last kick, take yours, pick your side
 * for their next one, send. The rules and whose turn it is are on the server (cg/shootout.js).
 */

export default function ShootoutChat({ game, move, busy, error }) {
  const [squad, setSquad] = useSavedSquad();
  const [saving, setSaving] = useState(false);
  const opp = game.players.find((p) => p.uid !== game.me);

  if (game.action === "squad") {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-4">
        <div className="text-center">
          <p className="font-mono text-[10px] tracking-[.2em] text-white/60 uppercase">Before kick-off</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">Pick your squad</h2>
          <p className="mt-1 text-sm text-white/65">
            Your shooter takes your kicks, your keeper faces {opp?.name ?? "theirs"}. {game.next?.keeper === game.me ? "You're in goal first." : "You shoot first."}
          </p>
        </div>
        <SquadPicker value={squad} onChange={setSquad} />
        <Button
          size="lg"
          loading={saving || busy}
          disabled={!squad}
          onClick={async () => {
            setSaving(true);
            try {
              await move({ do: "squad", ...squadPayload(squad) });
            } catch {
              /* shown below */
            } finally {
              setSaving(false);
            }
          }}
        >
          Walk out with this squad
        </Button>
        {error && <p className="text-center text-xs text-live">{error}</p>}
      </div>
    );
  }

  const view = { ...game, locked: null, clock: null };
  return (
    <div className="h-full px-2 pt-1 pb-2">
      <ShootoutMatch
        view={view}
        seenKey={`dw-so-seen-${game.id}`}
        onShoot={(shot) => move({ do: "shoot", shot })}
        onDive={(zone) => move({ do: "dive", zone })}
      />
    </div>
  );
}

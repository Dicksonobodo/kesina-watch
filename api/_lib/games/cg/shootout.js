import { GameError } from "../util.js";
import { addKick, kickAt, newShootout, shootoutView, shotFrom, squadFrom, tally, ZONES } from "../shootout.js";

/*
 * Mind Games: Shootout in the chat. The rules are in ../shootout.js; this file decides whose turn
 * it is, iMessage style: one go each, and every go is sent to the other player.
 *
 * The keeper always picks a side before the shot arrives, so a shot is decided the moment it is
 * taken. The one who starts the game keeps goal first (and picks a side for the first kick); then
 * each turn is: take your kick (you see the result), pick your side for their next one, send.
 * The side you picked stays on the server until their shot is in, so they can't see it.
 */

export function create(players) {
  const [starter, other] = players;
  return {
    state: { ...newShootout([other, starter]), squads: {} }, // the other player shoots first...
    secret: { shot: null, dive: null },
    turn: starter, // ...so the starter goes first, as the keeper
  };
}

/** What `uid` has to do on their turn: pick a squad, shoot or dive. */
function actionFor(g, uid) {
  if (g.status !== "playing" || g.turn !== uid) return null;
  if (!g.state.squads[uid]) return "squad";
  const next = kickAt(g.state.order, g.state.kicks.length);
  if (next.shooter === uid && !g.secret.shot) return "shoot";
  if (next.keeper === uid && !g.secret.dive) return "dive";
  return null;
}

export function view(g, uid) {
  const s = g.state;
  const next = kickAt(s.order, s.kicks.length);
  return {
    ...shootoutView(s, g.status === "done"),
    squads: s.squads,
    action: actionFor(g, uid),
    // Has the keeper already picked a side for the next kick? (Never which side.)
    diveLocked: Boolean(g.secret.dive) && g.status === "playing",
    myDive: next.keeper === uid ? g.secret.dive : null,
  };
}

export async function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  const s = g.state;
  if (body.do === "squad") {
    if (s.kicks.some((k) => k.shooter === uid || k.keeper === uid) || (g.secret.dive && kickAt(s.order, s.kicks.length).keeper === uid)) throw new GameError("Your squad is set for this game.");
    s.squads[uid] = await squadFrom({ shooter: body.shooter, keeper: body.keeper });
    return { changed: true };
  }
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  if (!s.squads[uid]) throw new GameError("Pick your shooter and keeper first.");
  const next = kickAt(s.order, s.kicks.length);

  if (body.do === "shoot") {
    if (next.shooter !== uid || g.secret.shot) throw new GameError("It's not your kick.");
    g.secret.shot = shotFrom(body.shot, next.yards);
  } else if (body.do === "dive") {
    if (next.keeper !== uid || g.secret.dive) throw new GameError("You've already picked a side.");
    if (!ZONES.includes(body.zone)) throw new GameError("Pick a side to dive.");
    g.secret.dive = body.zone;
  } else {
    throw new GameError("Unknown move.");
  }

  let kick = null;
  if (g.secret.shot && g.secret.dive) {
    const out = addKick(s, g.secret.shot, g.secret.dive);
    kick = out.kick;
    g.secret = { shot: null, dive: null };
    if (out.winner) return { changed: true, ended: true, winner: out.winner, kick };
  }
  // Still something to do this turn (you just shot: now pick a side for their kick)? Keep going.
  const after = kickAt(s.order, s.kicks.length);
  const stillMine = (after.shooter === uid && !g.secret.shot) || (after.keeper === uid && !g.secret.dive);
  g.turn = stillMine ? uid : g.players.find((p) => p !== uid);
  return { changed: true, kick };
}

export function card(g) {
  const s = g.state;
  const { goals } = tally(s);
  const marks = Object.fromEntries(s.order.map((p) => [p, s.kicks.filter((k) => k.shooter === p).map((k) => (k.result === "goal" ? 1 : 0))]));
  return { goals, marks, order: s.order, round: Math.floor(s.kicks.length / 2) + 1 };
}

export const title = "Mind Games: Shootout";

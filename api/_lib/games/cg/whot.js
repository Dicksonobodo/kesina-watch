import { GameError, shuffle } from "../util.js";

/*
 * Naija Whot for two. 54 cards: five shapes (circle, triangle, cross, square, star) plus five
 * Whot (20) cards. Get rid of your cards first.
 *
 *   Match the top card by shape or number.            Can't (or won't)? Pick one from the market.
 *   1  Hold on     play again.
 *   2  Pick two    the next player picks 2, unless they play a 2 too (it stacks).
 *   5  Pick three  the next player picks 3, unless they play a 5 too (it stacks).
 *   8  Suspension  the other player misses a turn (you play again).
 *   14 General market   the other player picks one card, and you play again.
 *   20 Whot        a wild card: name the shape the next player must follow.
 *
 * Hands and the market stay on the server; each player only ever receives their own cards.
 */

export const SHAPES = ["circle", "triangle", "cross", "square", "star"];
const CODE = { circle: "o", triangle: "t", cross: "x", square: "s", star: "r", whot: "w" };
const NUMBERS = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
};
const SPECIAL = new Set([1, 2, 5, 8, 14, 20]);
const START_HAND = 6;

const cardOf = (id) => ({ id, shape: Object.keys(CODE).find((k) => CODE[k] === id[0]), n: Number(id.slice(1).replace(/[a-z]$/, "")) });

function fullDeck() {
  const ids = [];
  for (const s of SHAPES) for (const n of NUMBERS[s]) ids.push(`${CODE[s]}${n}`);
  for (let i = 0; i < 5; i++) ids.push(`w20${"abcde"[i]}`);
  return ids;
}

export function create(players) {
  const deck = shuffle(fullDeck());
  const hands = Object.fromEntries(players.map((p) => [p, deck.splice(0, START_HAND)]));
  // The first card on the table is a plain one (no special effects).
  let start = deck.findIndex((id) => !SPECIAL.has(cardOf(id).n));
  const [top] = deck.splice(start, 1);
  const first = players[Math.floor(Math.random() * 2)];
  return {
    state: { top, pile: [top], demand: null, pending: { rank: 0, count: 0 }, log: [{ by: null, text: "Game on! Match the shape or the number." }], marketCount: deck.length, counts: Object.fromEntries(players.map((p) => [p, START_HAND])) },
    secret: { hands, deck },
    turn: first,
  };
}

const other = (g, uid) => g.players.find((p) => p !== uid);

export function playable(g, uid) {
  const { top, demand, pending } = g.state;
  const t = cardOf(top);
  return (g.secret.hands[uid] ?? []).filter((id) => {
    const c = cardOf(id);
    if (pending.count > 0) return c.n === pending.rank; // you can only answer a pick with the same number
    if (c.n === 20) return true;
    if (demand) return c.shape === demand;
    return c.shape === t.shape || c.n === t.n;
  });
}

export function view(g, uid) {
  const s = g.state;
  return {
    hand: (g.secret.hands[uid] ?? []).map(cardOf),
    playable: g.status === "playing" && g.turn === uid ? playable(g, uid) : [],
    top: cardOf(s.top),
    demand: s.demand,
    pending: s.pending,
    market: s.marketCount,
    counts: s.counts,
    log: s.log.slice(-6),
    handsAtEnd: g.status === "done" ? Object.fromEntries(g.players.map((p) => [p, (g.secret.hands[p] ?? []).map(cardOf)])) : null,
  };
}

function say(g, by, text) {
  g.state.log.push({ by, text });
  if (g.state.log.length > 30) g.state.log.shift();
}

/** Takes up to n cards from the market (reshuffling the pile when it runs out). */
function draw(g, uid, n) {
  const { deck, hands } = g.secret;
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!deck.length) {
      const rest = g.state.pile.slice(0, -1); // everything but the card on top
      if (!rest.length) break;
      g.state.pile = [g.state.top];
      deck.push(...shuffle(rest));
    }
    hands[uid].push(deck.shift());
    got++;
  }
  g.state.marketCount = deck.length;
  g.state.counts[uid] = hands[uid].length;
  return got;
}

const points = (hand) => hand.reduce((n, id) => n + cardOf(id).n, 0);

export function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  const s = g.state;
  const me = g.secret.hands[uid];
  const foe = other(g, uid);

  if (body.do === "draw") {
    const n = s.pending.count > 0 ? s.pending.count : 1;
    const got = draw(g, uid, n);
    say(g, uid, s.pending.count > 0 ? `picked ${got}` : "went to market");
    s.pending = { rank: 0, count: 0 };
    if (got === 0) {
      // Nothing left to draw: the game ends and the lowest hand wins.
      const [a, b] = g.players;
      const pa = points(g.secret.hands[a]);
      const pb = points(g.secret.hands[b]);
      say(g, null, "The market is empty. Lowest hand wins.");
      return { changed: true, ended: true, winner: pa === pb ? "draw" : pa < pb ? a : b };
    }
    g.turn = foe;
    return { changed: true };
  }

  if (body.do === "play") {
    const id = String(body.card ?? "");
    if (!me.includes(id)) throw new GameError("You don't have that card.");
    if (!playable(g, uid).includes(id)) throw new GameError(s.pending.count > 0 ? `Play a ${s.pending.rank} or pick ${s.pending.count}.` : "That card doesn't match.");
    const c = cardOf(id);
    let shape = null;
    if (c.n === 20) {
      shape = String(body.shape ?? "");
      if (!SHAPES.includes(shape)) throw new GameError("Choose a shape for the Whot card.");
    }
    me.splice(me.indexOf(id), 1);
    s.pile.push(id);
    s.top = id;
    s.demand = shape;
    s.counts[uid] = me.length;

    let again = false;
    let line = `played ${c.n === 20 ? "WHOT" : `${c.shape} ${c.n}`}`;
    if (c.n === 20) line += ` and wants ${shape}`;
    else if (c.n === 1) (again = true), (line += " · hold on");
    else if (c.n === 8) (again = true), (line += " · suspension");
    else if (c.n === 2 || c.n === 5) {
      s.pending = { rank: c.n, count: s.pending.count + (c.n === 2 ? 2 : 3) };
      line += ` · pick ${s.pending.count}`;
    } else if (c.n === 14) {
      const got = draw(g, foe, 1);
      again = true;
      line += ` · general market (${got ? "they pick one" : "market empty"})`;
    }
    if (c.n !== 2 && c.n !== 5) s.pending = { rank: 0, count: 0 };
    say(g, uid, line);

    if (me.length === 0) {
      say(g, uid, "has no cards left!");
      return { changed: true, ended: true, winner: uid };
    }
    if (me.length === 1) say(g, uid, "Last card!");
    g.turn = again ? uid : foe;
    return { changed: true };
  }
  throw new GameError("Unknown move.");
}

export const card = (g) => ({ counts: g.state.counts });
export const title = "Naija Whot";

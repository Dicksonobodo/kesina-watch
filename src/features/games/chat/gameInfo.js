/* What the chat knows about the games you can play in a conversation. */

export const CHAT_GAMES = [
  { id: "swipe", title: "Word Swipe", blurb: "Swipe letters into words. 80 seconds.", emoji: "🔤", color: "linear-gradient(135deg,#1d4ed8,#0ea5e9)", table: "radial-gradient(120% 80% at 50% 0%, #1e3a8a 0%, #0b1226 60%, #070a14 100%)" },
  { id: "whot", title: "Naija Whot", blurb: "The classic card game. Empty your hand first.", emoji: "🃏", color: "linear-gradient(135deg,#b91c1c,#f97316)", table: "radial-gradient(120% 75% at 50% 35%, #15803d 0%, #0b4d25 55%, #04200f 100%)" },
  { id: "darts", title: "Darts", blurb: "301. Three darts a turn. Hit zero.", emoji: "🎯", color: "linear-gradient(135deg,#047857,#84cc16)", table: "radial-gradient(120% 70% at 50% 25%, #4a2f1e 0%, #24170f 55%, #0e0906 100%)" },
];

const fmt = (n) => (n ?? 0).toLocaleString();

/** The caption under a game bubble, from your side of the conversation. */
export function gameCardLine(game, me, peerName = "They") {
  if (game.status === "done") {
    if (game.winner === "draw") return { text: "It's a draw", cta: "View" };
    const won = game.winner === me;
    if (game.type === "swipe" && game.scores) {
      const other = Object.keys(game.scores).find((u) => u !== me);
      return { text: `${won ? "You won" : `${peerName} won`} · ${fmt(game.scores[me])} to ${fmt(game.scores[other])}`, cta: "View", hot: won };
    }
    return { text: won ? "You won! 🎉" : `${peerName} won`, cta: "View", hot: won };
  }
  if (game.type === "swipe") {
    return game.played?.includes(me) ? { text: `Sent · waiting for ${peerName}`, cta: "Open", sent: true } : { text: "Your turn · 80 seconds", cta: "Play", hot: true };
  }
  return game.turn === me ? { text: "Your turn", cta: "Play", hot: true } : { text: `Sent · waiting for ${peerName}`, cta: "Open", sent: true };
}

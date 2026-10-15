/* What the chat knows about the games you can play in a conversation. */

export const CHAT_GAMES = [
  { id: "swipe", title: "Word Swipe", blurb: "Swipe letters into words. 80 seconds.", emoji: "🔤", color: "linear-gradient(135deg,#1d4ed8,#0ea5e9)", table: "radial-gradient(120% 80% at 50% 0%, #1e3a8a 0%, #0b1226 60%, #070a14 100%)" },
  { id: "whot", title: "Naija Whot", blurb: "The classic card game. Empty your hand first.", emoji: "🃏", color: "linear-gradient(135deg,#b91c1c,#f97316)", table: "radial-gradient(120% 75% at 50% 35%, #15803d 0%, #0b4d25 55%, #04200f 100%)" },
  { id: "behind", title: "Who's Behind You?", blurb: "Pick a footballer for them, guess your own.", emoji: "🕵️", color: "linear-gradient(135deg,#7c3aed,#db2777)", table: "radial-gradient(120% 80% at 50% 0%, #4c1d95 0%, #1e1035 60%, #0b0716 100%)" },
  { id: "ttt", title: "Tic Tac Toe", blurb: "Three in a row wins. X goes first.", emoji: "⭕", color: "linear-gradient(135deg,#0f766e,#6366f1)", table: "radial-gradient(120% 80% at 50% 10%, #134e4a 0%, #0f1f3a 55%, #070b16 100%)" },
  { id: "darts", title: "Darts", blurb: "301. Three darts a turn. Hit zero.", emoji: "🎯", color: "linear-gradient(135deg,#047857,#84cc16)", table: "radial-gradient(120% 70% at 50% 25%, #4a2f1e 0%, #24170f 55%, #0e0906 100%)" },
];

const fmt = (n) => (n ?? 0).toLocaleString();

/** The caption under a game bubble, from your side of the conversation. */
export function gameCardLine(game, me, peerName = "They") {
  if (game.status === "done") {
    if (game.winner === "draw") return { text: "It's a draw", cta: "View", result: "draw" };
    const won = game.winner === me;
    let detail = "";
    if (game.type === "swipe" && game.scores) {
      const other = Object.keys(game.scores).find((u) => u !== me);
      detail = `${fmt(game.scores[me])} to ${fmt(game.scores[other])}`;
    }
    return { text: won ? "You won" : "You lost", detail, cta: "View", result: won ? "won" : "lost" };
  }
  if (game.type === "swipe") {
    return game.played?.includes(me) ? { text: `Sent · waiting for ${peerName}`, cta: "Open", sent: true } : { text: "Your turn · 80 seconds", cta: "Play", hot: true };
  }
  return game.turn === me ? { text: "Your turn", cta: "Play", hot: true } : { text: `Sent · waiting for ${peerName}`, cta: "Open", sent: true };
}

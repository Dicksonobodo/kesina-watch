import { GameError } from "../util.js";

/*
 * Tic Tac Toe for two, in the chat. Whoever starts the game is X and goes first; every move is
 * sent to the other player. Three in a row (across, down or diagonal) wins; a full board is a draw.
 */

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

export function winningLine(board) {
  return LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) ?? null;
}

export function create(players) {
  const [x, o] = players;
  return {
    state: { board: Array(9).fill(""), marks: { [x]: "X", [o]: "O" }, last: null, line: null, moves: 0 },
    secret: {},
    turn: x,
  };
}

export function view(g) {
  const s = g.state;
  return { board: s.board, marks: s.marks, last: s.last, line: s.line, moves: s.moves };
}

export function move(g, uid, body) {
  if (g.status !== "playing") throw new GameError("This game is over.");
  if (g.turn !== uid) throw new GameError("It isn't your turn.");
  if (body.do !== "place") throw new GameError("Unknown move.");
  const cell = Number(body.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8) throw new GameError("Pick a square.");
  const s = g.state;
  if (s.board[cell]) throw new GameError("That square is taken.");
  s.board[cell] = s.marks[uid];
  s.last = cell;
  s.moves += 1;
  const line = winningLine(s.board);
  if (line) {
    s.line = line;
    return { changed: true, ended: true, winner: uid };
  }
  if (s.board.every(Boolean)) return { changed: true, ended: true, winner: "draw" };
  g.turn = g.players.find((p) => p !== uid);
  return { changed: true };
}

export const card = (g) => ({ board: g.state.board, marks: g.state.marks, line: g.state.line });
export const title = "Tic Tac Toe";

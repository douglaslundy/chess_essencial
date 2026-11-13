import { Chess } from 'chess.js';

/** Squares of the pieces (both colors) that attack at least one enemy piece. */
export function attackingSquares(fen: string): Set<string> {
  const chess = new Chess(fen);
  const attacking = new Set<string>();
  for (const cell of chess.board().flat()) {
    if (!cell) continue;
    for (const square of chess.attackers(cell.square, cell.color === 'w' ? 'b' : 'w')) {
      attacking.add(square);
    }
  }
  return attacking;
}

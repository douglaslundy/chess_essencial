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

/**
 * Squares wearing the ki aura on the flat board: the piece that just moved into an attack gets it
 * and keeps it for as long as it attacks something. Without a known move the aura is cleared.
 */
export function nextAuraSquares(
  old: ReadonlySet<string>,
  fen: string,
  move: { from: string; to: string } | null,
): Set<string> {
  const next = new Set<string>();
  if (!move) return next;
  let attacking: Set<string>;
  try {
    attacking = attackingSquares(fen);
  } catch {
    return next;
  }
  for (const square of old) {
    if (square !== move.from && square !== move.to && attacking.has(square)) next.add(square);
  }
  if (attacking.has(move.to)) next.add(move.to);
  return next;
}

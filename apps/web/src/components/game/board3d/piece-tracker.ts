import { Chess } from 'chess.js';

import type { PieceKind } from './piece-geometry';

export interface TrackedPiece {
  color: 'w' | 'b';
  id: number;
  square: string;
  type: PieceKind;
}

export interface Reconciled {
  /** Victim id -> id of the piece that took it (null when it cannot be determined). */
  captures: Array<{ captorId: number | null; victim: TrackedPiece }>;
  nextId: number;
  pieces: TrackedPiece[];
}

function distance(a: string, b: string) {
  return Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(Number(a[1]) - Number(b[1])),
  );
}

/**
 * Maps a new FEN onto the previous pieces so each physical piece keeps its identity
 * (and can animate between squares). Pieces that vanish are reported as captured.
 */
export function reconcile(prev: TrackedPiece[], fen: string, startId: number): Reconciled {
  const board = new Chess(fen).board().flat();
  const incoming = board.flatMap((cell) =>
    cell
      ? [{ color: cell.color, square: cell.square as string, type: cell.type as PieceKind }]
      : [],
  );
  const next: TrackedPiece[] = [];
  const leftoverPrev = new Set(prev);
  const leftoverNew: typeof incoming = [];
  let nextId = startId;

  for (const cell of incoming) {
    const stay = prev.find(
      (piece) =>
        leftoverPrev.has(piece) &&
        piece.square === cell.square &&
        piece.type === cell.type &&
        piece.color === cell.color,
    );
    if (stay) {
      leftoverPrev.delete(stay);
      next.push(stay);
    } else {
      leftoverNew.push(cell);
    }
  }

  const take = (cell: (typeof incoming)[number], accept: (piece: TrackedPiece) => boolean) => {
    let best: TrackedPiece | null = null;
    for (const piece of leftoverPrev) {
      if (piece.color !== cell.color || !accept(piece)) continue;
      if (!best || distance(piece.square, cell.square) < distance(best.square, cell.square)) {
        best = piece;
      }
    }
    if (best) leftoverPrev.delete(best);
    return best;
  };

  // Same-type moves first so a promotion never steals the pawn of an ordinary pawn move.
  const unmatched: typeof incoming = [];
  for (const cell of leftoverNew) {
    const moved = take(cell, (piece) => piece.type === cell.type);
    if (moved) next.push({ ...moved, square: cell.square });
    else unmatched.push(cell);
  }
  for (const cell of unmatched) {
    const promoted = cell.type !== 'p' ? take(cell, (piece) => piece.type === 'p') : null;
    if (promoted) next.push({ ...promoted, square: cell.square, type: cell.type });
    else next.push({ ...cell, id: nextId++ });
  }

  const captures = [...leftoverPrev].map((victim) => {
    const captor = next.find((piece) => {
      const before = prev.find((old) => old.id === piece.id);
      if (!before || before.square === piece.square) return false;
      // Normal capture lands on the victim's square; en passant lands one rank behind it.
      return (
        piece.square === victim.square ||
        (piece.type === 'p' &&
          piece.square[0] === victim.square[0] &&
          Math.abs(Number(piece.square[1]) - Number(victim.square[1])) === 1)
      );
    });
    return { captorId: captor?.id ?? null, victim };
  });

  return { captures, nextId, pieces: next };
}

export function initialPieces(fen: string): { nextId: number; pieces: TrackedPiece[] } {
  const result = reconcile([], fen, 1);
  return { nextId: result.nextId, pieces: result.pieces };
}

import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js';

export interface PlayedMove {
  /** Increments for every detected move so effects can restart even for identical SAN. */
  id: number;
  captured?: PieceSymbol | undefined;
  color: 'w' | 'b';
  from: Square;
  piece: PieceSymbol;
  san: string;
  to: Square;
}

/** Puzzles are solved by the side to move in the starting position, so that side sits at the bottom. */
export function solverOrientation(startingFen: string | null | undefined): 'white' | 'black' {
  return startingFen?.split(' ')[1] === 'b' ? 'black' : 'white';
}

const boardPart = (fen: string) => fen.split(' ').slice(0, 2).join(' ');

/**
 * Finds the single legal move that turns `previousFen` into `fen`. Returns null when the
 * position jumped (history navigation, new game, several plies at once).
 */
export function detectMove(previousFen: string, fen: string): Omit<PlayedMove, 'id'> | null {
  let moves: Move[];
  try {
    moves = new Chess(previousFen).moves({ verbose: true });
  } catch {
    return null;
  }
  const target = boardPart(fen);
  const move = moves.find((candidate) => boardPart(candidate.after) === target);
  if (!move) return null;
  return {
    captured: move.captured,
    color: move.color,
    from: move.from,
    piece: move.piece,
    san: move.san,
    to: move.to,
  };
}

/**
 * Squares a piece "walks" through, excluding the origin and including the destination.
 * Sliding pieces go square by square; the knight walks its L (long leg first).
 */
export function walkPath(from: Square, to: Square, piece: PieceSymbol): Square[] {
  const fx = from.charCodeAt(0) - 97;
  const fy = Number(from[1]) - 1;
  const tx = to.charCodeAt(0) - 97;
  const ty = Number(to[1]) - 1;
  const at = (x: number, y: number) => `${String.fromCharCode(97 + x)}${y + 1}` as Square;
  if (piece === 'n') {
    const dx = tx - fx;
    const dy = ty - fy;
    return Math.abs(dx) === 2
      ? [at(fx + Math.sign(dx), fy), at(tx, fy), to]
      : [at(fx, fy + Math.sign(dy)), at(fx, ty), to];
  }
  const steps = Math.max(Math.abs(tx - fx), Math.abs(ty - fy));
  const sx = Math.sign(tx - fx);
  const sy = Math.sign(ty - fy);
  const path: Square[] = [];
  for (let i = 1; i <= steps; i += 1) path.push(at(fx + sx * i, fy + sy * i));
  return path;
}

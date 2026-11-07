import type { GameMoveAnalysis } from '@xadrez/contracts';

/** Points for each move quality: good moves add, weak ones subtract (the counter starts at 0). */
export const MOVE_POINTS: Record<GameMoveAnalysis['quality'], number> = {
  bom: 4,
  erro: -10,
  excelente: 8,
  gafe: -20,
  imprecisao: -4,
  otimo: 10,
};

/** The bar is full at this many points, up or down. */
export const POINTS_BAR_LIMIT = 100;

/** Running total of one side's points up to (and including) `ply`; negative when it played badly. */
export function pointsThrough(
  moves: readonly Pick<GameMoveAnalysis, 'color' | 'ply' | 'quality'>[],
  ply: number,
  color: 'black' | 'white',
): number {
  return moves
    .filter((move) => move.color === color && move.ply <= ply)
    .reduce((total, move) => total + MOVE_POINTS[move.quality], 0);
}

/** Bar fill from -1 (empty to the left) to +1 (full to the right). */
export function pointsFill(points: number): number {
  return Math.max(-1, Math.min(1, points / POINTS_BAR_LIMIT));
}

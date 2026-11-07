/** A blunder costs at most this much in the average, so one lost game-winning move does not erase the rest. */
const MAX_LOSS_CP = 500;
const MIN_MOVES = 8;
const MIN_RATING = 400;
const MAX_RATING = 3000;

/**
 * Rough rating a player showed in one game, from the average centipawn loss of their moves
 * (exponential fit: ~20 cp ≈ 2500, ~50 cp ≈ 1900, ~100 cp ≈ 1100). An estimate for a single
 * game, not an official rating. Null when the game is too short to say anything.
 */
export function estimatePerformanceRating(centipawnLosses: number[]): number | null {
  if (centipawnLosses.length < MIN_MOVES) return null;
  const average =
    centipawnLosses.reduce((sum, loss) => sum + Math.min(Math.max(loss, 0), MAX_LOSS_CP), 0) /
    centipawnLosses.length;
  const rating = 3100 * Math.exp(-0.01 * average);
  return Math.round(Math.min(MAX_RATING, Math.max(MIN_RATING, rating)) / 10) * 10;
}

/** A game is worth sharing in the library: long enough, clean (no error or blunder) and strong. */
export const EXCELLENT_GAME_MIN_PLIES = 20;
export const EXCELLENT_GAME_MIN_RATING = 1800;

export function isExcellentGame(input: {
  centipawnLosses: number[];
  errors: number;
  plies: number;
}): boolean {
  if (input.plies < EXCELLENT_GAME_MIN_PLIES || input.errors > 0) return false;
  const rating = estimatePerformanceRating(input.centipawnLosses);
  return rating !== null && rating >= EXCELLENT_GAME_MIN_RATING;
}

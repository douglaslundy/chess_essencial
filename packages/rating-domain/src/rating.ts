export const RATING_ALGORITHM_VERSION = 'xe-fide-table-2026-10-v2';

/** Every player starts at 0 and climbs; the rating never goes below it. */
export const INITIAL_RATING = 0;

export const FIDE_EXPECTED_SCORE_BANDS = [
  [0, 3, 0.5],
  [4, 10, 0.51],
  [11, 17, 0.52],
  [18, 25, 0.53],
  [26, 32, 0.54],
  [33, 39, 0.55],
  [40, 46, 0.56],
  [47, 53, 0.57],
  [54, 61, 0.58],
  [62, 68, 0.59],
  [69, 76, 0.6],
  [77, 83, 0.61],
  [84, 91, 0.62],
  [92, 98, 0.63],
  [99, 106, 0.64],
  [107, 113, 0.65],
  [114, 121, 0.66],
  [122, 129, 0.67],
  [130, 137, 0.68],
  [138, 145, 0.69],
  [146, 153, 0.7],
  [154, 162, 0.71],
  [163, 170, 0.72],
  [171, 179, 0.73],
  [180, 188, 0.74],
  [189, 197, 0.75],
  [198, 206, 0.76],
  [207, 215, 0.77],
  [216, 225, 0.78],
  [226, 235, 0.79],
  [236, 245, 0.8],
  [246, 256, 0.81],
  [257, 267, 0.82],
  [268, 278, 0.83],
  [279, 290, 0.84],
  [291, 302, 0.85],
  [303, 315, 0.86],
  [316, 328, 0.87],
  [329, 344, 0.88],
  [345, 357, 0.89],
  [358, 374, 0.9],
  [375, 391, 0.91],
  [392, 411, 0.92],
  [412, 432, 0.93],
  [433, 456, 0.94],
  [457, 484, 0.95],
  [485, 517, 0.96],
  [518, 559, 0.97],
  [560, 619, 0.98],
  [620, 735, 0.99],
  [736, Number.POSITIVE_INFINITY, 1],
] as const;

export type GameScore = 0 | 0.5 | 1;

export interface RatingProfileSnapshot {
  rating: number;
  gamesCount: number;
  hasEverReached2400: boolean;
}

export interface RatingCalculation {
  algorithmVersion: string;
  ratingBefore: number;
  opponentRating: number;
  effectiveDifference: number;
  expectedScore: number;
  actualScore: GameScore;
  kFactor: number;
  rawDelta: number;
  delta: number;
  ratingAfter: number;
}

export function expectedScoreFide(player: number, opponent: number): number {
  const difference = player - opponent;
  const effectiveDifference =
    player < 2650 ? Math.max(-400, Math.min(400, difference)) : difference;
  const absoluteDifference = Math.abs(effectiveDifference);
  const band = FIDE_EXPECTED_SCORE_BANDS.find(
    ([minimum, maximum]) => absoluteDifference >= minimum && absoluteDifference <= maximum,
  );

  if (!band) throw new Error('Expected-score band not found');
  if (effectiveDifference === 0) return 0.5;
  return effectiveDifference > 0 ? band[2] : Number((1 - band[2]).toFixed(2));
}

export function kFactor(profile: RatingProfileSnapshot): 10 | 20 | 40 {
  if (profile.hasEverReached2400 || profile.rating >= 2400) return 10;
  if (profile.gamesCount <= 30) return 40;
  return 20;
}

export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function calculateRatingChange(
  profile: RatingProfileSnapshot,
  opponentRating: number,
  actualScore: GameScore,
): RatingCalculation {
  const expectedScore = expectedScoreFide(profile.rating, opponentRating);
  const factor = kFactor(profile);
  const rawDelta = (actualScore - expectedScore) * factor;
  // Floor at the initial rating: a loss near 0 costs only what is left.
  const delta = Math.max(roundHalfAwayFromZero(rawDelta), INITIAL_RATING - profile.rating);

  return {
    algorithmVersion: RATING_ALGORITHM_VERSION,
    ratingBefore: profile.rating,
    opponentRating,
    effectiveDifference:
      profile.rating < 2650
        ? Math.max(-400, Math.min(400, profile.rating - opponentRating))
        : profile.rating - opponentRating,
    expectedScore,
    actualScore,
    kFactor: factor,
    rawDelta,
    delta,
    ratingAfter: profile.rating + delta,
  };
}

import { describe, expect, it } from 'vitest';

import {
  calculateRatingChange,
  expectedScoreFide,
  INITIAL_RATING,
  FIDE_EXPECTED_SCORE_BANDS,
  kFactor,
  roundHalfAwayFromZero,
} from './rating.js';

describe('expectedScoreFide', () => {
  it('covers every local FIDE table band in both directions', () => {
    for (const [minimum, maximum, probabilityHigh] of FIDE_EXPECTED_SCORE_BANDS) {
      const difference = Number.isFinite(maximum) ? maximum : minimum;
      const highRating = Math.max(2650, 2650 + difference);
      const lowRating = highRating - difference;

      expect(expectedScoreFide(highRating, lowRating)).toBe(probabilityHigh);
      expect(expectedScoreFide(lowRating, highRating)).toBe(
        Number((1 - probabilityHigh).toFixed(2)),
      );
      expect(minimum).toBeLessThanOrEqual(difference);
    }
  });

  it('caps the difference at 400 only for players below 2650', () => {
    expect(expectedScoreFide(1200, 2200)).toBe(0.08);
    expect(expectedScoreFide(2649, 3649)).toBe(0.08);
    expect(expectedScoreFide(2650, 3650)).toBe(0);
  });

  it('returns equal expectations for equal ratings', () => {
    expect(expectedScoreFide(1800, 1800)).toBe(0.5);
  });
});

describe('kFactor', () => {
  it('uses 40 through game 30, 20 afterward below 2400, and 10 once 2400 is reached', () => {
    expect(kFactor({ rating: 1200, gamesCount: 30, hasEverReached2400: false })).toBe(40);
    expect(kFactor({ rating: 2200, gamesCount: 31, hasEverReached2400: false })).toBe(20);
    expect(kFactor({ rating: 2400, gamesCount: 5, hasEverReached2400: false })).toBe(10);
    expect(kFactor({ rating: 2300, gamesCount: 5, hasEverReached2400: true })).toBe(10);
  });
});

describe('rating calculation', () => {
  it('rounds positive and negative halves away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });

  it('calculates win, draw and loss from the same immutable snapshot', () => {
    const profile = { rating: 1800, gamesCount: 31, hasEverReached2400: false };

    expect(calculateRatingChange(profile, 1800, 1).delta).toBe(10);
    expect(calculateRatingChange(profile, 1800, 0.5).delta).toBe(0);
    expect(calculateRatingChange(profile, 1800, 0).delta).toBe(-10);
  });

  it('starts at 0, climbs on a win against a stronger player and never goes below 0', () => {
    const newcomer = { rating: INITIAL_RATING, gamesCount: 0, hasEverReached2400: false };

    expect(INITIAL_RATING).toBe(0);
    expect(calculateRatingChange(newcomer, 1200, 1)).toMatchObject({ delta: 37, ratingAfter: 37 });
    expect(calculateRatingChange(newcomer, 1200, 0)).toMatchObject({ delta: 0, ratingAfter: 0 });
    expect(calculateRatingChange({ ...newcomer, rating: 2 }, 1200, 0)).toMatchObject({
      delta: -2,
      ratingAfter: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';

import { estimatePerformanceRating, isExcellentGame } from './performance-rating.js';

describe('estimatePerformanceRating', () => {
  it('rates cleaner play higher', () => {
    const clean = estimatePerformanceRating(Array(20).fill(15))!;
    const sloppy = estimatePerformanceRating(Array(20).fill(90))!;
    expect(clean).toBeGreaterThan(sloppy);
    expect(clean).toBeGreaterThan(2400);
    expect(sloppy).toBeLessThan(1400);
  });

  it('does not let one blunder erase an otherwise clean game', () => {
    const losses = [...Array(19).fill(10), 5000];
    expect(estimatePerformanceRating(losses)!).toBeGreaterThan(1800);
  });

  it('stays silent on a game too short to judge', () => {
    expect(estimatePerformanceRating([10, 20, 30])).toBeNull();
  });
});

describe('isExcellentGame', () => {
  const clean = Array(15).fill(12);
  it('accepts a long, clean, strong game', () => {
    expect(isExcellentGame({ centipawnLosses: clean, errors: 0, plies: 40 })).toBe(true);
  });
  it('rejects a game with an error, a short game or weak play', () => {
    expect(isExcellentGame({ centipawnLosses: clean, errors: 1, plies: 40 })).toBe(false);
    expect(isExcellentGame({ centipawnLosses: clean, errors: 0, plies: 12 })).toBe(false);
    expect(isExcellentGame({ centipawnLosses: Array(15).fill(80), errors: 0, plies: 40 })).toBe(
      false,
    );
  });
});

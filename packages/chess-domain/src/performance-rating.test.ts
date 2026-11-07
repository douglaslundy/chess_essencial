import { describe, expect, it } from 'vitest';

import { estimatePerformanceRating } from './performance-rating.js';

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

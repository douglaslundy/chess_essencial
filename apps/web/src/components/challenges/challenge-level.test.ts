import { describe, expect, it } from 'vitest';

import { challengeDifficultyForRating } from './challenge-level';

describe('challengeDifficultyForRating', () => {
  it('maps the student rating to stable challenge bands', () => {
    expect(challengeDifficultyForRating(800)).toBe('beginner');
    expect(challengeDifficultyForRating(1200)).toBe('intermediate');
    expect(challengeDifficultyForRating(1600)).toBe('advanced');
    expect(challengeDifficultyForRating(2000)).toBe('expert');
  });
});

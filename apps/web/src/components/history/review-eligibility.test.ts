import { describe, expect, it } from 'vitest';

import { reviewEligibility } from './review-eligibility';

describe('reviewEligibility', () => {
  it.each(['resignation', 'abandonment'])('blocks review after %s', (termination) => {
    expect(reviewEligibility({ status: 'finished', termination }).available).toBe(false);
  });

  it('blocks review while a game is still active', () => {
    expect(reviewEligibility({ status: 'active', termination: 'none' }).available).toBe(false);
  });

  it('allows review for a game completed on the board', () => {
    expect(reviewEligibility({ status: 'finished', termination: 'checkmate' }).available).toBe(
      true,
    );
  });
});

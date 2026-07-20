import { describe, expect, it } from 'vitest';

import { guidedChallengeLine } from './guided-challenge-lines';

describe('guidedChallengeLine', () => {
  it('includes the automatic opponent reply in a multi-move challenge', () => {
    expect(guidedChallengeLine('11000000-0000-4000-8000-000000000002')).toEqual([
      'e6g8',
      'f8g8',
      'h6f7',
    ]);
  });

  it('does not expose a line for exercises outside the guided catalog', () => {
    expect(guidedChallengeLine('unknown')).toBeNull();
  });
});

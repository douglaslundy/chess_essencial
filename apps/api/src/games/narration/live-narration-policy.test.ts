import { describe, expect, it } from 'vitest';

import { canNarrateLiveTurn } from './live-narration-policy.js';

describe('canNarrateLiveTurn', () => {
  const playerTurn = {
    coachMode: true,
    playerColor: 'white' as const,
    sideToMove: 'white' as const,
    status: 'active',
  };

  it('allows narration on the own-player active turn', () => {
    expect(canNarrateLiveTurn(playerTurn)).toBe(true);
  });

  it('blocks narration during the opponent turn', () => {
    expect(canNarrateLiveTurn({ ...playerTurn, sideToMove: 'black' })).toBe(false);
  });

  it('blocks narration outside coach mode or after the game ends', () => {
    expect(canNarrateLiveTurn({ ...playerTurn, coachMode: false })).toBe(false);
    expect(canNarrateLiveTurn({ ...playerTurn, status: 'finished' })).toBe(false);
  });
});

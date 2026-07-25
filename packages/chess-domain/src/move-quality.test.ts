import { describe, expect, it } from 'vitest';

import { classifyMove } from './move-quality.js';

function input(overrides: Partial<Parameters<typeof classifyMove>[0]>) {
  return {
    mateAfter: null,
    mateBefore: null,
    scoreAfterCp: 0,
    scoreBeforeCp: 0,
    ...overrides,
  };
}

describe('classifyMove', () => {
  it('classifies the engine top move (no loss) as otimo', () => {
    const result = classifyMove(input({ scoreAfterCp: 30, scoreBeforeCp: 30 }));
    expect(result).toMatchObject({ centipawnLoss: 0, missedWin: false, quality: 'otimo' });
  });

  it.each([
    [15, 'excelente'],
    [40, 'bom'],
    [80, 'imprecisao'],
    [200, 'erro'],
    [500, 'gafe'],
  ] as const)('classifies a %icp loss as %s', (loss, quality) => {
    const result = classifyMove(input({ scoreAfterCp: 100 - loss, scoreBeforeCp: 100 }));
    expect(result.quality).toBe(quality);
  });

  it('caps centipawn loss for display when losing a forced mate entirely', () => {
    const result = classifyMove(input({ mateBefore: 3, scoreAfterCp: -900 }));
    expect(result.centipawnLoss).toBe(1000);
    expect(result.quality).toBe('gafe');
  });

  it('does not penalize keeping a forced mate, even via a slower mating line', () => {
    const result = classifyMove(input({ mateAfter: 5, mateBefore: 2 }));
    expect(result.centipawnLoss).toBe(0);
    expect(result.quality).toBe('otimo');
  });

  it('flags a missed win when a much better move was available but the position stays fine', () => {
    const result = classifyMove(input({ scoreAfterCp: 20, scoreBeforeCp: 250 }));
    expect(result.missedWin).toBe(true);
  });

  it('does not flag a missed win when the position collapses into a loss', () => {
    const result = classifyMove(input({ scoreAfterCp: -400, scoreBeforeCp: 250 }));
    expect(result.missedWin).toBe(false);
  });

  it('flags a missed win when a forced mate was let slip but the mover is still clearly better', () => {
    const result = classifyMove(input({ mateBefore: 4, scoreAfterCp: 400 }));
    expect(result.missedWin).toBe(true);
    expect(result.quality).toBe('gafe');
  });
});

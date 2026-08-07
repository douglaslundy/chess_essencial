import { describe, expect, it } from 'vitest';

import { formatCoachExplanation } from './coach-explanation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('formatCoachExplanation', () => {
  it('explains objective, theme, strategy, trap and a calculated line', () => {
    const result = formatCoachExplanation(START, {
      bestMoveUci: 'e2e4',
      mate: null,
      principalVariation: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4'],
    });

    expect(result).toContain('Eu sugiro e4.');
    expect(result).toContain('Objetivo:');
    expect(result).toContain('Tema: controle do centro.');
    expect(result).toContain('Estratégia:');
    expect(result).toContain('Armadilha:');
    expect(result).toContain('Linha possível calculada: e4, e5, Cf3, Cc6, Bb5, a6, Ba4.');
  });

  it('limits the forecast to the current move plus three opponent replies', () => {
    const result = formatCoachExplanation(START, {
      bestMoveUci: 'e2e4',
      mate: null,
      principalVariation: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'],
    });

    expect(result).toContain('Ba4.');
    expect(result).not.toContain('Cf6');
  });
});

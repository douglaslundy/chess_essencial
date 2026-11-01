import { describe, expect, it } from 'vitest';

import { formatCoachExplanation } from './coach-explanation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('formatCoachExplanation', () => {
  it('gives the suggestion, one short idea and a three-move line, never naming the engine', () => {
    const result = formatCoachExplanation(START, {
      bestMoveUci: 'e2e4',
      mate: null,
      principalVariation: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'],
    });

    expect(result).toBe(
      'Eu indico e4. Eu disputo o centro e libero o desenvolvimento. Sequência que eu calculo: e4, e5, Cf3.',
    );
    expect(result).not.toMatch(/motor/i);
  });
});

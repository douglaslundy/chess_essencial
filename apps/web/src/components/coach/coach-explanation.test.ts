import { describe, expect, it } from 'vitest';

import { formatCoachExplanation, formatCoachWarning } from './coach-explanation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('formatCoachExplanation', () => {
  it('gives the suggestion, one short idea and a three-move line, never naming the engine', () => {
    const result = formatCoachExplanation(START, {
      bestMoveUci: 'e2e4',
      mate: null,
      principalVariation: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'g8f6'],
    });

    expect(result).toBe(
      'Eu indico e4, para disputar o centro. A linha que eu imagino é e4, e5, Cf3.',
    );
    expect(result).not.toMatch(/motor/i);
  });
});

describe('formatCoachWarning', () => {
  it('says what the weak move gives away and what to play instead', () => {
    const fen = '2r1k3/8/8/8/2B5/8/8/2R1K3 w - - 0 1';
    const text = formatCoachWarning(
      fen,
      'c1a1',
      { centipawnLoss: 320, label: 'uma gafe', missedWin: false },
      'c4f7',
      'speech',
    );
    expect(text).toContain('Deixa o bispo em c4 vulnerável a captura.');
    expect(text).toContain('Eu jogaria o bispo de c4 para f7');
    expect(text).not.toMatch(/centipawn/i);
  });
});

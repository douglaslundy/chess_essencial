import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { selectBotMove } from './bot-move.js';

describe('selectBotMove', () => {
  it('always returns a legal move for every supported strength band', () => {
    const fen = new Chess().fen();
    for (const strength of [800, 1200, 1600, 2000]) {
      const move = selectBotMove(fen, strength, () => 0.5);
      const chess = new Chess(fen);
      const promotion = move[4];
      expect(() =>
        chess.move({
          from: move.slice(0, 2),
          to: move.slice(2, 4),
          ...(promotion ? { promotion } : {}),
        }),
      ).not.toThrow();
    }
  });

  it('takes a hanging queen at expert strength', () => {
    const move = selectBotMove('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 2000, () => 0);
    expect(move).toBe('e4d5');
  });
});

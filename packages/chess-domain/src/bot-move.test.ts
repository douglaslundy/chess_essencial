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

  it('also takes a hanging queen at intermediate strength (looks one ply ahead)', () => {
    const move = selectBotMove('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 1200, () => 0);
    expect(move).toBe('e4d5');
  });

  it('avoids a move that immediately hangs its own queen at intermediate strength', () => {
    // White queen on d1 can be captured for free by the black queen on d8 if
    // it steps to d5; a bot that only counts material (no reply search)
    // would treat every non-capturing queen move as equally scored.
    const move = selectBotMove('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 1200, () => 0);
    expect(move).not.toBe('d1d5');
  });

  it('separates difficulty bands: beginner ignores danger, expert never does', () => {
    const fen = '4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1';
    // Beginner picks uniformly at random among all legal moves; forcing the
    // random source to the last option should NOT reliably be the capture.
    const beginnerMove = selectBotMove(fen, 800, () => 0.999);
    const expertMove = selectBotMove(fen, 2000, () => 0.999);
    expect(expertMove).toBe('e4d5');
    expect(beginnerMove).not.toBe(expertMove);
  });
});

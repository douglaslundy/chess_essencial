import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import {
  buildSolutionLines,
  findMateFirstMoves,
  forcedMateInAtMost,
  hasCheckingMove,
  isPlayableStart,
} from './mate-solver.js';

describe('mate-solver', () => {
  it('finds a back-rank mate in one', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1';
    expect(findMateFirstMoves(fen, 1)).toEqual(['e1e8']);
  });

  it('does not report a mate-in-two position as mate in one', () => {
    const fen = '5r1k/6pp/4Q2N/8/8/8/8/K7 w - - 0 1';
    expect(findMateFirstMoves(fen, 1)).toEqual([]);
  });

  // Full mate-in-2 search + line building runs close to vitest's 5000ms
  // default on a loaded CI runner (~5.1s observed) — not an infinite loop,
  // just a slow exhaustive search. Give it real headroom instead of racing.
  it('finds the mate-in-two first move and builds its interleaved line', () => {
    const fen = '5r1k/6pp/4Q2N/8/8/8/8/K7 w - - 0 1';
    expect(findMateFirstMoves(fen, 2)).toContain('e6g8');
    expect(buildSolutionLines(fen, 2, 'e6g8')).toContainEqual(['e6g8', 'f8g8', 'h6f7']);
  }, 20_000);

  it('recognizes forced mate depth', () => {
    const fen = '5r1k/6pp/4Q2N/8/8/8/8/K7 w - - 0 1';
    expect(forcedMateInAtMost(new Chess(fen), 2)).toBe(true);
    expect(forcedMateInAtMost(new Chess(fen), 1)).toBe(false);
  });

  it('detects an available checking move', () => {
    expect(hasCheckingMove('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1')).toBe(true);
    // Two lone kings: no checks possible.
    expect(hasCheckingMove('4k3/8/8/8/8/8/8/4K3 w - - 0 1')).toBe(false);
  });

  it('rejects positions where the side not to move is in check', () => {
    // White to move but black king attacked by the rook: illegal start.
    expect(isPlayableStart('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1')).toBe(false);
    expect(isPlayableStart('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { evaluatePosition } from './stockfish-engine.js';

const START_POSITION_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MATE_IN_ONE_FEN = '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1';
const SHALLOW_DEPTH = 8;

describe('evaluatePosition', () => {
  it(
    'returns a legal best move and a centipawn score for the starting position',
    async () => {
      const evaluation = await evaluatePosition(START_POSITION_FEN, { depth: SHALLOW_DEPTH });

      expect(evaluation.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
      expect(evaluation.mate).toBeNull();
      expect(evaluation.scoreCp).not.toBeNull();
    },
    20_000,
  );

  it(
    'detects a forced mate in one',
    async () => {
      const evaluation = await evaluatePosition(MATE_IN_ONE_FEN, { depth: SHALLOW_DEPTH });

      expect(evaluation.bestMove).toBe('a1a8');
      expect(evaluation.mate).toBe(1);
    },
    20_000,
  );
});

import { describe, expect, it } from 'vitest';

import { evaluatePosition } from './stockfish-engine.js';

const START_POSITION_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MATE_IN_ONE_FEN = '6k1/5ppp/8/8/8/8/8/R6K w - - 0 1';
const SHALLOW_DEPTH = 8;

describe('evaluatePosition', () => {
  it('returns a legal best move and a centipawn score for the starting position', async () => {
    const evaluation = await evaluatePosition(START_POSITION_FEN, { depth: SHALLOW_DEPTH });

    expect(evaluation.bestMove).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    expect(evaluation.mate).toBeNull();
    expect(evaluation.scoreCp).not.toBeNull();
  }, 20_000);

  it('detects a forced mate in one', async () => {
    const evaluation = await evaluatePosition(MATE_IN_ONE_FEN, { depth: SHALLOW_DEPTH });

    expect(evaluation.bestMove).toBe('a1a8');
    expect(evaluation.mate).toBe(1);
  }, 20_000);

  // A checkmate/stalemate position has no legal moves for the engine to
  // search — Stockfish would just answer "bestmove (none)" with no score at
  // all, which upstream code used to silently read as an even (0cp)
  // position. That turned the winning mating move into an apparent huge
  // blunder (see game-analysis-job.ts). These positions must be recognized
  // and scored directly, without ever spawning the engine.
  it('reports a checkmate position as the worst possible score for the mated side, without spawning the engine', async () => {
    // Classic back-rank mate: black king on g8 boxed in by its own f7/g7/h7
    // pawns, mated by the white rook on a8 along the back rank.
    const evaluation = await evaluatePosition('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
    expect(evaluation).toEqual({ bestMove: null, mate: null, pv: [], scoreCp: -100_000 });
  });

  it('reports a stalemate position as neutral (0cp), without spawning the engine', async () => {
    const evaluation = await evaluatePosition('7k/8/5KQ1/8/8/8/8/8 b - - 0 1');
    expect(evaluation).toEqual({ bestMove: null, mate: null, pv: [], scoreCp: 0 });
  });
});

import { describe, expect, it } from 'vitest';

import { evaluatePosition } from './browser-engine';

describe('evaluatePosition on a finished game', () => {
  it('scores a checkmated position as lost for the side to move, without starting the engine', async () => {
    // Fool's mate: white to move and mated.
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    expect(await evaluatePosition(mated)).toMatchObject({ bestMove: null, scoreCp: -100000 });
  });

  it('scores a stalemate as even', async () => {
    const stalemate = '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1';
    expect(await evaluatePosition(stalemate)).toMatchObject({ mate: null, scoreCp: 0 });
  });
});

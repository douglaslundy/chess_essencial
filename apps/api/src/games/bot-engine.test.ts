import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { selectBotMoveWithEngine } from './bot-engine.js';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const legal = (fen: string, uci: string) =>
  new Chess(fen)
    .moves({ verbose: true })
    .some((move) => `${move.from}${move.to}${move.promotion ?? ''}` === uci);

describe('selectBotMoveWithEngine', () => {
  it('plays a legal Stockfish move for a strong bot', async () => {
    const move = await selectBotMoveWithEngine(START, 1800);
    expect(legal(START, move)).toBe(true);
  }, 15_000);

  it('takes a free queen with a strong bot', async () => {
    const fen = '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1';
    expect(await selectBotMoveWithEngine(fen, 2000)).toBe('d2d5');
  }, 15_000);

  it('falls back to the heuristic bot when the engine cannot start', async () => {
    const move = await selectBotMoveWithEngine(START, 1800, 'nao-existe.cjs');
    expect(legal(START, move)).toBe(true);
  }, 15_000);

  it('keeps the heuristic bot for weak levels', async () => {
    expect(legal(START, await selectBotMoveWithEngine(START, 800))).toBe(true);
  });
});

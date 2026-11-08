import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import { blunderRate, selectBotMoveWithEngine } from './bot-engine.js';

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

  it('plays a legal move for weak levels too', async () => {
    expect(legal(START, await selectBotMoveWithEngine(START, 800))).toBe(true);
  }, 15_000);

  it('plays a random legal move at the blunder rate for a weak bot, without the engine', async () => {
    const move = await selectBotMoveWithEngine(START, 400, 'nao-existe.cjs', () => 0);
    expect(legal(START, move)).toBe(true);
  });
});

describe('blunderRate', () => {
  it('is zero from the engine floor up and grows as the bot gets weaker', () => {
    expect(blunderRate(1320)).toBe(0);
    expect(blunderRate(2000)).toBe(0);
    expect(blunderRate(1000)).toBeCloseTo(0.11);
    expect(blunderRate(1160)).toBeCloseTo(0.055);
    expect(blunderRate(850)).toBeGreaterThan(blunderRate(1000));
    expect(blunderRate(100)).toBe(0.3);
  });
});

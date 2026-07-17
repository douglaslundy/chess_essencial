import { describe, expect, it } from 'vitest';

import { ChessJsRules, IllegalMoveError, InvalidFenError, InvalidUciError } from './index.js';

describe('ChessJsRules', () => {
  it('detects Fool’s Mate and exports SAN, FEN, UCI and PGN', () => {
    const game = new ChessJsRules();
    game.applyMove('f2f3');
    game.applyMove('e7e5');
    game.applyMove('g2g4');
    const mate = game.applyMove('d8h4');

    expect(mate.uci).toBe('d8h4');
    expect(mate.san).toBe('Qh4#');
    expect(mate.status).toMatchObject({
      isGameOver: true,
      result: 'black_win',
      termination: 'checkmate',
    });
    expect(mate.fenBefore).not.toBe(mate.fenAfter);
    expect(game.pgn()).toContain('Qh4#');
  });

  it('handles king-side castling', () => {
    const game = new ChessJsRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const move = game.applyMove('e1g1');

    expect(move.san).toBe('O-O');
    expect(move.flags.castling).toBe('king_side');
    expect(move.flags.capture).toBe(false);
  });

  it('handles en passant', () => {
    const game = new ChessJsRules('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
    game.applyMove('d7d5');
    const move = game.applyMove('e5d6');

    expect(move.san).toBe('exd6');
    expect(move.flags.enPassant).toBe(true);
    expect(move.flags.capture).toBe(true);
  });

  it('requires the promotion piece and records promotion', () => {
    const game = new ChessJsRules('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');

    expect(() => game.applyMove('a7a8')).toThrow(IllegalMoveError);
    const move = game.applyMove('a7a8q');

    expect(move.promotion).toBe('q');
    expect(move.flags.promotion).toBe(true);
    expect(move.san).toMatch(/^a8=Q/);
  });

  it('detects threefold repetition after replay', () => {
    const sequence = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const game = new ChessJsRules('startpos', sequence);

    expect(game.status()).toMatchObject({
      isGameOver: true,
      result: 'draw',
      termination: 'repetition',
    });
    expect(game.history()).toHaveLength(8);
    expect(
      new ChessJsRules(
        'startpos',
        game.history().map((move) => move.uci),
      ).fen(),
    ).toBe(game.fen());
  });

  it('detects stalemate, insufficient material and fifty-move rule', () => {
    expect(new ChessJsRules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').status()).toMatchObject({
      result: 'draw',
      termination: 'stalemate',
    });
    expect(new ChessJsRules('8/8/8/8/8/1k6/8/K7 w - - 0 1').status()).toMatchObject({
      result: 'draw',
      termination: 'insufficient_material',
    });

    const fiftyMove = new ChessJsRules('8/8/8/8/8/1k6/8/K6R w - - 99 50');
    expect(fiftyMove.applyMove('h1h2').status).toMatchObject({
      result: 'draw',
      termination: 'fifty_move',
    });
  });

  it('evaluates mating material for timeout results', () => {
    expect(new ChessJsRules('8/8/8/8/8/8/6B1/K6k w - - 0 1').canWinOnTime('white')).toBe(false);
    expect(new ChessJsRules('8/8/8/8/8/8/6R1/K6k w - - 0 1').canWinOnTime('white')).toBe(true);
  });

  it('rejects malformed UCI, illegal moves and invalid FEN', () => {
    const game = new ChessJsRules();
    expect(() => game.applyMove('e2-e4')).toThrow(InvalidUciError);
    expect(() => game.applyMove('e2e5')).toThrow(IllegalMoveError);
    expect(() => new ChessJsRules('invalid fen')).toThrow(InvalidFenError);
  });
});

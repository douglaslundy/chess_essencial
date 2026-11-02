import { describe, expect, it } from 'vitest';

import { fallbackHint, gradePlayedMoves } from './exercise-grader.js';

describe('gradePlayedMoves', () => {
  it('solves a single-move line', () => {
    expect(gradePlayedMoves([['e1e8']], ['e1e8'])).toEqual({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 1,
    });
  });

  it('continues a mate-in-two after the first player move', () => {
    expect(gradePlayedMoves([['e6g8', 'f8g8', 'h6f7']], ['e6g8'])).toEqual({
      status: 'continue',
      opponentReply: 'f8g8',
      movesConfirmed: 1,
    });
  });

  it('solves a mate-in-two once both player moves are played', () => {
    expect(gradePlayedMoves([['e6g8', 'f8g8', 'h6f7']], ['e6g8', 'h6f7'])).toEqual({
      status: 'solved',
      opponentReply: null,
      movesConfirmed: 2,
    });
  });

  it('rejects a wrong first move', () => {
    expect(gradePlayedMoves([['e6g8', 'f8g8', 'h6f7']], ['a1a2'])).toMatchObject({
      status: 'incorrect',
    });
  });

  it('follows whichever alternative line the player matches', () => {
    const lines = [
      ['e1e8', 'g8h7', 'a1a8'],
      ['a1a8', 'g8h7', 'e1e8'],
    ];
    expect(gradePlayedMoves(lines, ['a1a8'])).toEqual({
      status: 'continue',
      opponentReply: 'g8h7',
      movesConfirmed: 1,
    });
  });

  it('is case-insensitive and trims moves', () => {
    expect(gradePlayedMoves([['E1E8']], [' e1e8 '])).toMatchObject({ status: 'solved' });
  });
});

describe('fallbackHint', () => {
  it('names the piece of the first solution move', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3';
    expect(fallbackHint(fen, [['h5f7']])).toBe('Comece com a dama que está em h5.');
    expect(fallbackHint(fen, [['c4f7', 'e8f7']])).toBe('Comece com o bispo que está em c4.');
  });

  it('gives no hint without a usable first move', () => {
    expect(fallbackHint('8/8/8/8/8/8/8/8 w - - 0 1', [['e2e4']])).toBeNull();
    expect(fallbackHint('8/8/8/8/8/8/8/8 w - - 0 1', [])).toBeNull();
  });
});

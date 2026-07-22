import { describe, expect, it } from 'vitest';

import { gradePlayedMoves } from './exercise-grader.js';

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

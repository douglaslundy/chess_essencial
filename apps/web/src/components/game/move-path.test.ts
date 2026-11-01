import { describe, expect, it } from 'vitest';

import { detectMove, hintSquares, solverOrientation, walkPath } from './move-path';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('walkPath', () => {
  it('walks sliding pieces square by square', () => {
    expect(walkPath('a1', 'a4', 'r')).toEqual(['a2', 'a3', 'a4']);
    expect(walkPath('c1', 'f4', 'b')).toEqual(['d2', 'e3', 'f4']);
    expect(walkPath('e2', 'e4', 'p')).toEqual(['e3', 'e4']);
  });

  it('walks the knight along its L, long leg first', () => {
    expect(walkPath('g1', 'f3', 'n')).toEqual(['g2', 'g3', 'f3']);
    expect(walkPath('b1', 'd2', 'n')).toEqual(['c1', 'd1', 'd2']);
  });
});

describe('detectMove', () => {
  it('finds the move between two consecutive positions', () => {
    const after = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(detectMove(START, after)).toMatchObject({ from: 'e2', piece: 'p', san: 'e4', to: 'e4' });
  });

  it('reports captures', () => {
    const before = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const after = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';
    expect(detectMove(before, after)).toMatchObject({ captured: 'p', san: 'exd5' });
  });

  it('returns null when the position jumped', () => {
    expect(detectMove(START, START)).toBeNull();
    expect(detectMove('not a fen', START)).toBeNull();
  });
});

describe('hintSquares', () => {
  it('marks the squares the hinted piece crosses and its target', () => {
    const { path, target } = hintSquares(START, { from: 'g1', to: 'f3' });
    expect([...path]).toEqual(['g2', 'g3']);
    expect(target).toBe('f3');
  });

  it('is empty without a hint or when the origin square is empty', () => {
    expect(hintSquares(START, undefined).target).toBeNull();
    expect(hintSquares(START, { from: 'e4', to: 'e5' }).target).toBeNull();
  });
});

describe('solverOrientation', () => {
  it('puts the side to move of the starting position at the bottom', () => {
    expect(solverOrientation(START)).toBe('white');
    expect(solverOrientation('8/8/8/8/8/8/8/k6K b - - 0 1')).toBe('black');
    expect(solverOrientation(null)).toBe('white');
  });
});

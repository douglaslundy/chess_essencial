import { describe, expect, it } from 'vitest';

import { pointsFill, pointsThrough } from './move-points';

const moves = [
  { color: 'white', ply: 1, quality: 'otimo' },
  { color: 'black', ply: 2, quality: 'gafe' },
  { color: 'white', ply: 3, quality: 'erro' },
  { color: 'black', ply: 4, quality: 'bom' },
] as const;

describe('move points', () => {
  it('starts at zero', () => {
    expect(pointsThrough(moves, 0, 'white')).toBe(0);
  });

  it('adds good moves and subtracts bad ones per side, up to the current ply', () => {
    expect(pointsThrough(moves, 1, 'white')).toBe(10);
    expect(pointsThrough(moves, 3, 'white')).toBe(0);
    expect(pointsThrough(moves, 2, 'black')).toBe(-20);
    expect(pointsThrough(moves, 4, 'black')).toBe(-16);
  });

  it('keeps the bar fill inside -1..1', () => {
    expect(pointsFill(-250)).toBe(-1);
    expect(pointsFill(50)).toBe(0.5);
    expect(pointsFill(400)).toBe(1);
  });
});

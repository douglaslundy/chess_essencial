import { describe, expect, it } from 'vitest';

import { parseLine, sideOf } from '../database/import-openings.js';
import { nextReview, pgnMoves } from './opening-study.js';

describe('pgnMoves', () => {
  it('drops the move numbers', () => {
    expect(pgnMoves('1. e4 c5 2. Nf3 d6')).toEqual(['e4', 'c5', 'Nf3', 'd6']);
  });
});

describe('opening import', () => {
  it('turns a named line into UCI moves and picks the side to study', () => {
    const line = parseLine('B20', 'Sicilian Defense', '1. e4 c5');
    expect(line).toMatchObject({
      family: 'Sicilian Defense',
      ply_count: 2,
      side: 'black',
      uci: 'e2e4 c7c5',
    });
    expect(sideOf('Italian Game: Giuoco Piano')).toBe('white');
    expect(parseLine('A00', 'Broken', '1. e9')).toBeNull();
  });

  it('keeps the family before the colon', () => {
    expect(
      parseLine('B90', 'Sicilian Defense: Najdorf Variation', '1. e4 c5 2. Nf3 d6')?.family,
    ).toBe('Sicilian Defense');
  });
});

describe('nextReview (spaced repetition)', () => {
  const now = new Date('2026-11-08T12:00:00Z');
  const fresh = { ease: 2.5, intervalDays: 0, repetitions: 0 };

  it('lengthens the interval after each right answer', () => {
    const first = nextReview(fresh, true, now);
    expect(first.intervalDays).toBe(1);
    const second = nextReview(first, true, now);
    expect(second.intervalDays).toBe(3);
    const third = nextReview(second, true, now);
    expect(third.intervalDays).toBe(Math.round(3 * second.ease));
    expect(third.dueAt.getTime()).toBeGreaterThan(second.dueAt.getTime());
  });

  it('brings a wrong answer back in ten minutes and lowers the ease', () => {
    const wrong = nextReview({ ease: 2.5, intervalDays: 6, repetitions: 3 }, false, now);
    expect(wrong).toMatchObject({ ease: 2.3, intervalDays: 0, repetitions: 0 });
    expect(wrong.dueAt.getTime() - now.getTime()).toBe(10 * 60 * 1000);
    expect(nextReview({ ease: 1.3, intervalDays: 1, repetitions: 1 }, false, now).ease).toBe(1.3);
  });
});

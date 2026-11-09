import { describe, expect, it } from 'vitest';

import { isOnStudiedLine } from './opening-play';

describe('isOnStudiedLine', () => {
  const line = ['e4', 'c5', 'Nf3'];

  it('is true while every played move is the studied one', () => {
    expect(isOnStudiedLine(line, [])).toBe(true);
    expect(isOnStudiedLine(line, ['e2e4', 'c7c5'])).toBe(true);
  });

  it('is false at the first move that differs or goes past the line', () => {
    expect(isOnStudiedLine(line, ['e2e4', 'e7e5'])).toBe(false);
    expect(isOnStudiedLine(line, ['e2e4', 'c7c5', 'g1f3', 'd7d6'])).toBe(false);
  });
});

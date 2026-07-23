import { describe, expect, it } from 'vitest';

import { generateOnlineSchedule, isWithinSchedule } from './generate-schedule.js';

function seededRandom(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe('generateOnlineSchedule', () => {
  it('generates between one and three windows within a single day', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const windows = generateOnlineSchedule(seededRandom(seed));
      expect(windows.length).toBeGreaterThanOrEqual(1);
      expect(windows.length).toBeLessThanOrEqual(3);
      for (const window of windows) {
        expect(window.startMinute).toBeGreaterThanOrEqual(0);
        expect(window.endMinute).toBeLessThanOrEqual(1440);
        expect(window.endMinute).toBeGreaterThan(window.startMinute);
      }
    }
  });

  it('returns windows sorted by start time', () => {
    const windows = generateOnlineSchedule(seededRandom(17));
    const starts = windows.map((window) => window.startMinute);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe('isWithinSchedule', () => {
  it('is true only inside a window and false right at or after its end', () => {
    const windows = [{ endMinute: 600, startMinute: 500 }];
    expect(isWithinSchedule(windows, 499)).toBe(false);
    expect(isWithinSchedule(windows, 500)).toBe(true);
    expect(isWithinSchedule(windows, 599)).toBe(true);
    expect(isWithinSchedule(windows, 600)).toBe(false);
  });

  it('is false for an empty schedule', () => {
    expect(isWithinSchedule([], 720)).toBe(false);
  });
});

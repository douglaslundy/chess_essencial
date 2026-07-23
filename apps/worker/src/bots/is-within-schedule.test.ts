import { describe, expect, it } from 'vitest';

import { isWithinSchedule } from './is-within-schedule.js';

describe('isWithinSchedule', () => {
  it('is true only inside a window and false right at or after its end', () => {
    const windows = [{ endMinute: 600, startMinute: 500 }];
    expect(isWithinSchedule(windows, 499)).toBe(false);
    expect(isWithinSchedule(windows, 500)).toBe(true);
    expect(isWithinSchedule(windows, 599)).toBe(true);
    expect(isWithinSchedule(windows, 600)).toBe(false);
  });

  it('checks every window, not just the first', () => {
    const windows = [
      { endMinute: 120, startMinute: 60 },
      { endMinute: 1000, startMinute: 900 },
    ];
    expect(isWithinSchedule(windows, 950)).toBe(true);
  });

  it('is false for an empty schedule', () => {
    expect(isWithinSchedule([], 720)).toBe(false);
  });
});

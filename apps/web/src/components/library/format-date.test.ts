import { describe, expect, it } from 'vitest';

import { formatPlayedOn } from './format-date';

describe('formatPlayedOn', () => {
  it('shows dates as day/month/year', () => {
    expect(formatPlayedOn('1972-07-11')).toBe('11/07/1972');
  });

  it('keeps partial dates untouched', () => {
    expect(formatPlayedOn('1972')).toBe('1972');
  });
});

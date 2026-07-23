import { describe, expect, it } from 'vitest';

import { toIsoString, toIsoStringOrNull } from './to-iso-string.js';

describe('toIsoString', () => {
  it('passes through a Date instance', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(toIsoString(date)).toBe('2026-01-02T03:04:05.000Z');
  });

  it('parses a raw Postgres timestamptz string', () => {
    expect(toIsoString('2026-01-02 03:04:05.000019+00')).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('toIsoStringOrNull', () => {
  it('returns null for null and undefined', () => {
    expect(toIsoStringOrNull(null)).toBeNull();
    expect(toIsoStringOrNull(undefined)).toBeNull();
  });

  it('converts a Date or a raw string otherwise', () => {
    expect(toIsoStringOrNull(new Date('2026-01-02T03:04:05.000Z'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
    expect(toIsoStringOrNull('2026-01-02 03:04:05+00')).toBe('2026-01-02T03:04:05.000Z');
  });
});

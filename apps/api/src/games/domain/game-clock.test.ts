import { describe, expect, it } from 'vitest';

import { calculateClockTransition, effectiveClockMs } from './game-clock.js';

describe('authoritative game clock', () => {
  const started = new Date('2026-01-01T00:00:00.000Z');

  it('charges elapsed time, applies delay and adds increment after a legal move', () => {
    expect(
      calculateClockTransition({
        activeClockStartedAt: started,
        clockBeforeMs: 60_000,
        delayMs: 1_000,
        incrementMs: 2_000,
        receivedAt: new Date('2026-01-01T00:00:05.500Z'),
      }),
    ).toEqual({
      chargedMs: 4_500,
      clockAfterMoveMs: 57_500,
      elapsedMs: 5_500,
      timedOut: false,
    });
  });

  it('never trusts negative elapsed time and detects timeout before accepting a move', () => {
    expect(effectiveClockMs(10_000, started, new Date('2025-12-31T23:59:59.000Z'))).toBe(10_000);
    expect(
      calculateClockTransition({
        activeClockStartedAt: started,
        clockBeforeMs: 3_000,
        delayMs: 0,
        incrementMs: 10_000,
        receivedAt: new Date('2026-01-01T00:00:03.000Z'),
      }),
    ).toMatchObject({ clockAfterMoveMs: 0, timedOut: true });
  });
});

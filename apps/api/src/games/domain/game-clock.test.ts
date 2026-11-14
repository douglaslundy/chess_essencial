import { describe, expect, it } from 'vitest';

import {
  CAPTURE_FILM_MS,
  calculateClockTransition,
  effectiveClockMs,
  captureFilmClockStart,
  nextClockStart,
} from './game-clock.js';

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

  it('pauses the clock only while a capture film plays, never past the film length', () => {
    const film = { capturedAt: started, currentStart: started, senderToMove: true };
    const at = (ms: number) => new Date(started.getTime() + ms);
    // No report (film off or failed to load): the clock runs from the capture.
    expect(nextClockStart(at(3_000), started)).toEqual(at(3_000));
    // Film started 1.2 s after the capture: paused until the film ends.
    const paused = captureFilmClockStart({ ...film, now: at(1_200), playing: true });
    expect(paused).toEqual(at(CAPTURE_FILM_MS));
    expect(effectiveClockMs(60_000, paused, at(5_000))).toBe(60_000);
    // A reply during the film keeps the pause for the player still watching.
    expect(nextClockStart(at(3_000), paused!)).toEqual(paused);
    // A late "playing" is refused; skipping or an error starts the sender's clock at once.
    expect(captureFilmClockStart({ ...film, now: at(9_000), playing: true })).toBeNull();
    expect(
      captureFilmClockStart({ ...film, currentStart: paused!, now: at(4_000), playing: false }),
    ).toEqual(at(4_000));
    expect(
      captureFilmClockStart({
        ...film,
        currentStart: paused!,
        now: at(4_000),
        playing: false,
        senderToMove: false,
      }),
    ).toBeNull();
  });
});

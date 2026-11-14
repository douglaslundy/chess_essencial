export interface ClockTransitionInput {
  activeClockStartedAt: Date;
  clockBeforeMs: number;
  delayMs: number;
  incrementMs: number;
  receivedAt: Date;
}

export interface ClockTransition {
  chargedMs: number;
  clockAfterMoveMs: number;
  elapsedMs: number;
  timedOut: boolean;
}

export function calculateClockTransition(input: ClockTransitionInput): ClockTransition {
  const elapsedMs = Math.max(0, input.receivedAt.getTime() - input.activeClockStartedAt.getTime());
  const chargedMs = Math.max(0, elapsedMs - input.delayMs);
  const remainingMs = Math.max(0, input.clockBeforeMs - chargedMs);
  const timedOut = remainingMs === 0;

  return {
    chargedMs,
    clockAfterMoveMs: timedOut ? 0 : remainingMs + input.incrementMs,
    elapsedMs,
    timedOut,
  };
}

export function effectiveClockMs(
  storedClockMs: number,
  activeClockStartedAt: Date | null,
  now: Date,
  delayMs = 0,
) {
  if (!activeClockStartedAt) return storedClockMs;
  const elapsedMs = Math.max(0, now.getTime() - activeClockStartedAt.getTime());
  return Math.max(0, storedClockMs - Math.max(0, elapsedMs - delayMs));
}

/**
 * After a capture both players may watch the capture film (1 s on the board + 10 s of film), so no
 * clock runs for this long. It is a fixed server rule: the client is never asked whether it watched.
 */
export const CAPTURE_FILM_MS = 11_000;

/**
 * When the clock of the side to move starts counting. A capture opens the film pause; a quick
 * reply inside the pause keeps it, so the capturing player is not charged while still watching.
 */
export function nextClockStart(receivedAt: Date, previousStart: Date, capture: boolean) {
  if (capture) return new Date(receivedAt.getTime() + CAPTURE_FILM_MS);
  return previousStart > receivedAt ? previousStart : receivedAt;
}

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

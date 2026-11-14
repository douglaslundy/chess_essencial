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

/** The capture film: 1 s with the capture on the board + 10 s of film. */
export const CAPTURE_FILM_MS = 11_000;
/** A film must report that it started this soon after the capture (start delay + loading). */
export const CAPTURE_FILM_START_WINDOW_MS = 7_000;

/**
 * When the clock of the side to move starts counting: at once, unless a capture film is still
 * holding it (a quick reply inside the pause must not charge the player who is still watching).
 */
export function nextClockStart(receivedAt: Date, previousStart: Date) {
  return previousStart > receivedAt ? previousStart : receivedAt;
}

export interface CaptureFilmInput {
  capturedAt: Date;
  currentStart: Date;
  now: Date;
  /** The film started; false when it ended, was skipped or failed. */
  playing: boolean;
  senderToMove: boolean;
}

/**
 * New clock start after a player's film report, or null when nothing changes. The pause exists
 * only while a film really plays, and never goes past `capturedAt + CAPTURE_FILM_MS`, whatever
 * the client says.
 */
export function captureFilmClockStart(input: CaptureFilmInput): Date | null {
  const { capturedAt, currentStart, now } = input;
  if (input.playing) {
    if (now.getTime() > capturedAt.getTime() + CAPTURE_FILM_START_WINDOW_MS) return null;
    const filmEnd = new Date(capturedAt.getTime() + CAPTURE_FILM_MS);
    return currentStart < filmEnd ? filmEnd : null;
  }
  // Film over: the sender's own clock runs again at once; the opponent's pause is not theirs to cut.
  return input.senderToMove && currentStart > now ? now : null;
}

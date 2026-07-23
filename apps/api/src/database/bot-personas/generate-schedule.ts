export interface OnlineWindow {
  /** Minutes since UTC midnight (0-1439). */
  startMinute: number;
  endMinute: number;
}

const MINUTES_PER_DAY = 1440;
const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 180;

/**
 * A daily online/offline schedule for one bot persona: 1-3 non-overlapping
 * windows spread across the day, so 200 personas collectively show varied
 * activity rather than all going on/offline at the same time.
 */
export function generateOnlineSchedule(random: () => number = Math.random): OnlineWindow[] {
  const windowCount = 1 + Math.floor(random() * 3);
  const windows: OnlineWindow[] = [];
  for (let index = 0; index < windowCount; index += 1) {
    const duration =
      MIN_DURATION_MINUTES + Math.floor(random() * (MAX_DURATION_MINUTES - MIN_DURATION_MINUTES));
    const startMinute = Math.floor(random() * (MINUTES_PER_DAY - duration));
    windows.push({ endMinute: startMinute + duration, startMinute });
  }
  return windows.sort((left, right) => left.startMinute - right.startMinute);
}

/** Whether the given UTC minute-of-day falls inside any of the schedule's windows. */
export function isWithinSchedule(windows: OnlineWindow[], minuteOfDay: number): boolean {
  return windows.some(
    (window) => minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute,
  );
}

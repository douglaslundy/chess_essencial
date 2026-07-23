export interface OnlineWindow {
  /** Minutes since UTC midnight (0-1439). */
  startMinute: number;
  endMinute: number;
}

/** Whether the given UTC minute-of-day falls inside any of the schedule's windows. */
export function isWithinSchedule(windows: OnlineWindow[], minuteOfDay: number): boolean {
  return windows.some(
    (window) => minuteOfDay >= window.startMinute && minuteOfDay < window.endMinute,
  );
}

// Demo time. The demo account uses UTC, so a virtual instant reads the same
// in every visitor's browser. Day 0 is a Monday; only weekdays and clock times
// are ever shown, never dates.
export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;
export const WEEK_START = Date.UTC(2024, 0, 1); // a Monday, 00:00 UTC

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Display order of the week, Monday first, as getUTCDay numbers. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** Whole days since the demo's first Monday. */
export function dayNumber(ms: number): number {
  return Math.floor((ms - WEEK_START) / DAY);
}

export function weekdayName(ms: number): string {
  return WEEKDAYS[new Date(ms).getUTCDay()];
}

export function clockTime(ms: number): string {
  const date = new Date(ms);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function dayAndTime(ms: number): string {
  return `${weekdayName(ms)} ${clockTime(ms)}`;
}

/** "Tue 09:00", as the app's campaign row names the time a waiting campaign continues. */
export function shortDayAndTime(ms: number): string {
  return `${WEEKDAYS_SHORT[new Date(ms).getUTCDay()]} ${clockTime(ms)}`;
}

export interface WindowRule {
  days: number[];
  start: string;
}

/**
 * When the human can next press Start and see a message leave: the window's
 * opening time on the first allowed day. With `sameDay`, today counts if the
 * opening is still ahead; otherwise the search starts tomorrow (a new day is
 * what resets the daily cap, and a closed window only reopens tomorrow).
 */
export function nextOpening(window: WindowRule, fromMs: number, sameDay: boolean): number {
  const opening = clockMinutes(window.start) * MINUTE;
  for (let offset = sameDay ? 0 : 1; offset <= 8; offset += 1) {
    const day = startOfDay(fromMs) + offset * DAY;
    if (!window.days.includes(new Date(day).getUTCDay())) continue;
    const at = day + opening;
    if (at >= fromMs) return at;
  }
  throw new Error("The sending window has no days.");
}

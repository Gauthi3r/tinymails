import type { Account } from "./types";

type Schedule = Pick<Account, "timeZone" | "sendingWindow">;

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MINUTE = 60_000;
/** A sending window names at least one weekday, so it always opens again within eight days. */
const SEARCH_MINUTES = 8 * 24 * 60;

const formatters = new Map<string, Intl.DateTimeFormat>();

interface LocalMoment {
  /** The calendar day in the account's time zone, as YYYY-MM-DD. */
  day: string;
  /** 0 is Sunday. */
  weekday: number;
  /** 24-hour HH:MM. */
  time: string;
}

function localMoment(date: Date, timeZone: string): LocalMoment {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    weekday: WEEKDAYS[values.weekday],
    time: `${values.hour}:${values.minute}`,
  };
}

/** The calendar day of an instant in a time zone, as YYYY-MM-DD. Daily caps count per local day. */
export function localDay(date: Date, timeZone: string): string {
  return localMoment(date, timeZone).day;
}

export function isWithinSendingWindow(account: Schedule, date: Date): boolean {
  const { weekday, time } = localMoment(date, account.timeZone);
  const { days, start, end } = account.sendingWindow;
  if (start <= end) return days.includes(weekday) && time >= start && time <= end;
  // An overnight window (for example 22:00 to 06:00) belongs to the day it opened on.
  if (time >= start) return days.includes(weekday);
  if (time <= end) return days.includes((weekday + 6) % 7);
  return false;
}

/**
 * The first minute at or after `from` when this account may send again: inside
 * its sending window and, when today's cap is already used up, on a later
 * local day. Returns null only for a window that never opens.
 */
export function nextSendTime(account: Schedule, from: Date, capReachedToday: boolean): Date | null {
  const today = localDay(from, account.timeZone);
  const firstMinute = Math.ceil(from.getTime() / MINUTE) * MINUTE;
  for (let offset = 0; offset <= SEARCH_MINUTES; offset += 1) {
    const candidate = new Date(firstMinute + offset * MINUTE);
    if (!isWithinSendingWindow(account, candidate)) continue;
    if (capReachedToday && localDay(candidate, account.timeZone) === today) continue;
    return candidate;
  }
  return null;
}

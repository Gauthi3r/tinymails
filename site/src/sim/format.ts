import { WEEKDAYS, WEEK_ORDER } from "./time";
import type { Rules } from "./world";

/** "Monday to Friday", "Every day", or "Monday, Wednesday and Friday". */
export function daysText(days: number[]): string {
  const ordered = WEEK_ORDER.filter((weekday) => days.includes(weekday));
  if (ordered.length === 7) return "Every day";
  const positions = ordered.map((weekday) => WEEK_ORDER.indexOf(weekday));
  const contiguous = positions.every((position, index) => index === 0 || position === positions[index - 1] + 1);
  const names = ordered.map((weekday) => WEEKDAYS[weekday]);
  if (names.length === 1) return names[0];
  if (contiguous && names.length > 2) return `${names[0]} to ${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function delayText(rules: Rules): string {
  return rules.delayMinSeconds === rules.delayMaxSeconds
    ? `${rules.delayMinSeconds} seconds apart`
    : `${rules.delayMinSeconds} to ${rules.delayMaxSeconds} seconds apart`;
}

/** The three rules in one line, for the hero's queue. */
export function rulesLine(rules: Rules): string {
  return `${rules.dailyCap} a day. ${daysText(rules.days)}, ${rules.start} to ${rules.end}. ${delayText(rules)}.`;
}

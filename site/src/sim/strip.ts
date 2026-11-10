import type { Plan } from "./plan";
import { WEEKDAYS, WEEKDAYS_SHORT } from "./time";
import type { Rules } from "./world";

export interface StripDay {
  weekday: number;
  open: boolean;
  count: number;
}

export interface StripModel {
  weeks: StripDay[][];
}

/** The week strip's data: one row per week the plan touches, Monday first. */
export function stripModel(plan: Plan, rules: Rules): StripModel {
  const lastDay = plan.days.length ? plan.days[plan.days.length - 1].day : 0;
  const weekCount = Math.max(1, Math.floor(lastDay / 7) + 1);
  const counts = new Map(plan.days.map((day) => [day.day, day.count]));
  const weeks: StripDay[][] = [];
  for (let week = 0; week < weekCount; week += 1) {
    const row: StripDay[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = week * 7 + offset;
      const weekday = (day + 1) % 7; // day 0 is a Monday
      row.push({ weekday, open: rules.days.includes(weekday), count: counts.get(day) ?? 0 });
    }
    weeks.push(row);
  }
  return { weeks };
}

const ENVELOPE = '<svg class="strip-env" viewBox="0 0 12 9" aria-hidden="true"><rect width="12" height="9"/><path d="M0 0h12L6 5z"/></svg>';

/**
 * Markup for the strip, shared by the build (no script) and the page script:
 * one cell per day, seven to a week, every cell the same size. Closed days are
 * drawn too, in a darker tone.
 */
export function stripHtml(model: StripModel): string {
  const size = model.weeks.length > 2 ? "compact" : model.weeks.length > 1 ? "medium" : "full";
  const cells = model.weeks
    .flatMap((week, index) =>
      week.map((day) => {
        const label = `${WEEKDAYS[day.weekday]}${model.weeks.length > 1 ? `, week ${index + 1}` : ""}: ${
          day.open ? `${day.count} sent` : "outside the window"
        }`;
        const head = index === 0 || size !== "compact" ? `<span class="strip-name">${WEEKDAYS_SHORT[day.weekday]}</span>` : "";
        const count = day.open ? `<span class="strip-count${day.count ? "" : " is-zero"}">${day.count}</span>` : "";
        const mail = day.count ? `<span class="strip-mail" aria-hidden="true">${ENVELOPE.repeat(day.count)}</span>` : "";
        return `<li class="strip-day${day.open ? "" : " is-closed"}" aria-label="${label}"><span class="strip-top" aria-hidden="true">${head}${count}</span>${mail}</li>`;
      }),
    )
    .join("");
  return `<ol class="strip" data-size="${size}" data-weeks="${model.weeks.length}">${cells}</ol>`;
}

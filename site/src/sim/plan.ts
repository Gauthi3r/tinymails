import { CAP_REASON, WINDOW_REASON } from "./session";
import { DemoController } from "./controller";
import { WEEKDAYS, WEEK_ORDER, dayNumber, nextOpening } from "./time";
import { DEFAULT_SEED, DemoWorld, type Rules } from "./world";

export interface PlanDay {
  /** Days since the demo's first Monday. */
  day: number;
  weekday: number;
  count: number;
  /** Virtual instants of each send that day. */
  times: number[];
}

export interface Plan {
  total: number;
  days: PlanDay[];
  presses: number;
  capPauses: number;
  windowPauses: number;
  /** Calendar days from the first send to the last, inclusive. */
  span: number;
  sentence: string;
  note: string | null;
}

const MAX_PRESSES = 1_000;

/**
 * Runs the real CampaignRunner to completion on a virtual clock and reads off
 * what happened. The human presses Start at the first window opening, and
 * again at every next opening after a pause, which is the soonest TinyMails
 * could carry on.
 */
export async function planRun(rules: Rules, seed = DEFAULT_SEED): Promise<Plan> {
  const world = new DemoWorld({ rules, seed });
  const controller = new DemoController(world);
  const test = await controller.sendTest();
  if (!test.ok) throw new Error(test.error);

  let presses = 0;
  let capPauses = 0;
  let windowPauses = 0;
  let sentBefore = 0;
  while (presses < MAX_PRESSES) {
    const started = await controller.start();
    if (!started.ok) throw new Error(started.error);
    presses += 1;
    await started.run;
    const campaign = world.campaign();
    const sent = campaign.recipients.filter((recipient) => recipient.status === "sent").length;
    if (campaign.status === "done") break;
    if (sent === sentBefore) throw new Error("A press of Start sent nothing; the plan cannot finish.");
    sentBefore = sent;
    if (campaign.pauseReason === CAP_REASON) capPauses += 1;
    else if (campaign.pauseReason === WINDOW_REASON) windowPauses += 1;
    else throw new Error(`Unexpected pause: ${campaign.pauseReason}`);
    world.now = nextOpening(rules, world.now, false);
  }

  const byDay = new Map<number, PlanDay>();
  for (const recipient of world.campaign().recipients) {
    if (recipient.status !== "sent" || !recipient.sentAt) continue;
    const at = Date.parse(recipient.sentAt);
    const day = dayNumber(at);
    const entry = byDay.get(day) ?? { day, weekday: new Date(at).getUTCDay(), count: 0, times: [] };
    entry.count += 1;
    entry.times.push(at);
    byDay.set(day, entry);
  }
  const days = [...byDay.values()].sort((left, right) => left.day - right.day);
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const span = days.length ? days[days.length - 1].day - days[0].day + 1 : 0;
  const plan = { total, days, presses, capPauses, windowPauses, span };
  return { ...plan, sentence: planSentence(plan), note: planNote(plan, rules) };
}

type PlanFacts = Omit<Plan, "sentence" | "note">;

export function dayLabel(day: number): string {
  const weekday = WEEKDAYS[(day + 1) % 7]; // day 0 is a Monday
  const week = Math.floor(day / 7);
  if (week === 0) return weekday;
  if (week === 1) return `next ${weekday}`;
  return `${weekday} of week ${week + 1}`;
}

function presses(count: number): string {
  if (count === 1) return "You press Start once.";
  if (count === 2) return "You press Start twice.";
  return `You press Start ${count} times.`;
}

function emails(count: number): string {
  return count === 1 ? "1 email" : `${count} emails`;
}

export function planSentence(plan: PlanFacts): string {
  const { days, total } = plan;
  if (days.length === 0) return "Nothing leaves.";
  const last = days[days.length - 1];
  const first = days[0];
  if (days.length === 1) return `${emails(total)} leave on ${dayLabel(first.day)}. ${presses(plan.presses)}`;

  const over = plan.span > days.length ? `on ${days.length} sending days` : `over ${days.length} days`;
  if (days.length <= 3) {
    const parts = days.map((day) => `${day.count} on ${dayLabel(day.day)}`);
    return `${emails(total)} leave ${over}: ${parts.join(", ")}. ${presses(plan.presses)}`;
  }

  const head = days.slice(0, -1);
  const steady = head.every((day) => day.count === head[0].count);
  if (steady && last.count === head[0].count) {
    return `${emails(total)} leave ${over}, ${head[0].count} a day from ${dayLabel(first.day)} to ${dayLabel(last.day)}. ${presses(plan.presses)}`;
  }
  if (steady) {
    const before = head[head.length - 1];
    return `${emails(total)} leave ${over}: ${head[0].count} a day from ${dayLabel(first.day)} to ${dayLabel(before.day)}, then ${last.count} on ${dayLabel(last.day)}. ${presses(plan.presses)}`;
  }
  const counts = days.map((day) => day.count);
  return `${emails(total)} leave ${over}, between ${Math.min(...counts)} and ${Math.max(...counts)} a day, from ${dayLabel(first.day)} to ${dayLabel(last.day)}. ${presses(plan.presses)}`;
}

export function planNote(plan: PlanFacts, rules: Rules): string | null {
  const notes: string[] = [];
  // Every day but the last ends with a pause. A day that sent fewer than the
  // cap was cut short by the window.
  const full = plan.days.slice(0, -1);
  const short = full.filter((day) => day.count < rules.dailyCap).length;
  if (full.length > 0 && short === full.length) {
    notes.push(`The window closes before the daily cap of ${rules.dailyCap} is reached.`);
  } else if (short > 0) {
    notes.push(`On some days the window closes before the daily cap of ${rules.dailyCap} is reached.`);
  }
  if (plan.days.length > 1) {
    const first = plan.days[0].day;
    const last = plan.days[plan.days.length - 1].day;
    const skipped = new Set<number>();
    for (let day = first; day <= last; day += 1) {
      const weekday = (day + 1) % 7; // day 0 is a Monday
      if (!rules.days.includes(weekday)) skipped.add(weekday);
    }
    if (skipped.size > 0) {
      const names = WEEK_ORDER.filter((weekday) => skipped.has(weekday)).map((weekday) => WEEKDAYS[weekday]);
      const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
      notes.push(`Nothing leaves on ${list}, outside the window.`);
    }
  }
  return notes.length ? notes.join(" ") : null;
}

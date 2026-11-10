import { describe, expect, it } from "vitest";
import { planRun } from "./plan";
import { CAP_REASON, DemoSession, MANUAL_REASON, WINDOW_REASON } from "./session";
import { dayAndTime } from "./time";
import { DEFAULT_RULES, DemoWorld, type Rules } from "./world";

const rules = (overrides: Partial<Rules>): Rules => ({ ...DEFAULT_RULES, ...overrides });

describe("the agent's two requests", () => {
  it("imports 42 rows and queues 40, excluding a duplicate and a do-not-contact address", () => {
    const world = new DemoWorld();
    expect(world.imported).toMatchObject({ added: 41, duplicate: 1, invalid: 0, existing: 0 });
    expect(world.created.campaign.status).toBe("paused");
    expect(world.created.campaign.recipients).toHaveLength(40);
    expect(world.created.excluded).toEqual([
      { email: "grace@example.org", reason: "duplicate" },
      { email: "hedy@example.net", reason: "do-not-contact" },
    ]);
  });

  it("renders the first recipient's test message with the product's renderMessage", () => {
    const preview = new DemoWorld().preview();
    expect(preview.subject).toBe("Thanks for joining, Ada");
    expect(preview.body).toContain("Hi Ada,");
    expect(preview.body).toContain("to Analytical Engines on Thursday.");
  });
});

describe("the demo session", () => {
  it("refuses Start before the test, and Pause when nothing runs", async () => {
    const session = new DemoSession();
    expect(session.state().status).toBe("Start unlocks after the test.");
    const start = await session.start();
    expect(start).toEqual({ ok: false, error: "Send this campaign's personalized preview before starting." });
    expect(await session.pause()).toEqual({ ok: false, error: "Only a running campaign can be paused." });
    expect(session.state().sent).toBe(0);
    expect(session.world.gmail.sent).toHaveLength(0);
  });

  it("sends the test to the user's own address and unlocks Start", async () => {
    const session = new DemoSession();
    const test = await session.sendTest();
    expect(test).toMatchObject({ ok: true, to: "you@example.com", subject: "Thanks for joining, Ada" });
    expect(session.state().status).toBe("Test sent to you@example.com.");
    expect(session.state().phase).toBe("ready");
  });

  it("pauses at 25 with the real cap reason, waits at Tuesday 09:00, and needs a second Start", async () => {
    const session = new DemoSession();
    await session.sendTest();
    await session.start();
    let state = session.state();
    expect(state.sent).toBe(25);
    expect(state.campaign.status).toBe("paused");
    expect(state.campaign.pauseReason).toBe(CAP_REASON);
    expect(dayAndTime(state.now)).toBe("Tuesday 09:00");
    expect(state.status).toBe(
      "The Gmail account's daily cap has been reached. It is now Tuesday 09:00. Press Start to continue.",
    );
    expect(state.phase).toBe("waiting");

    await session.start();
    state = session.state();
    expect(state.sent).toBe(40);
    expect(state.phase).toBe("done");
    expect(state.status).toBe("Done. 40 sent.");
    // 40 campaign messages plus the one test.
    expect(session.world.gmail.sent).toHaveLength(41);
  });

  it("pauses manually with the real string and resumes on Start", async () => {
    let pauseAfter = 3;
    let session!: DemoSession;
    session = new DemoSession({
      pace: async () => {
        pauseAfter -= 1;
        if (pauseAfter === 0) await session.pause();
      },
    });
    await session.sendTest();
    await session.start();
    let state = session.state();
    expect(state.campaign.pauseReason).toBe(MANUAL_REASON);
    expect(state.status).toBe("Paused manually.");
    expect(state.sent).toBe(3);
    await session.start();
    state = session.state();
    expect(state.sent).toBe(25);
    expect(state.campaign.pauseReason).toBe(CAP_REASON);
  });

  it("replays the same run for the same seed, and a different one for another seed", async () => {
    const times = async (seed: number) => {
      const session = new DemoSession({ seed });
      await session.sendTest();
      await session.start();
      return session.state().campaign.recipients.map((recipient) => recipient.sentAt ?? null);
    };
    expect(await times(7)).toEqual(await times(7));
    expect(await times(7)).not.toEqual(await times(8));
  });
});

describe("the plan", () => {
  it("defaults: 25 on Monday, 15 on Tuesday, two presses", async () => {
    const plan = await planRun(DEFAULT_RULES);
    expect(plan.sentence).toBe("40 emails leave over 2 days: 25 on Monday, 15 on Tuesday. You press Start twice.");
    expect(plan.note).toBeNull();
    expect(plan.capPauses).toBe(1);
  });

  it("a cap of 10 takes four days", async () => {
    const plan = await planRun(rules({ dailyCap: 10 }));
    expect(plan.sentence).toBe("40 emails leave over 4 days, 10 a day from Monday to Thursday. You press Start 4 times.");
  });

  it("a cap of 40 or more sends everything on Monday with one press", async () => {
    const plan = await planRun(rules({ dailyCap: 50 }));
    expect(plan.sentence).toBe("40 emails leave on Monday. You press Start once.");
  });

  it("skips the weekend", async () => {
    const plan = await planRun(rules({ dailyCap: 8 }));
    expect(plan.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5]);
    const longer = await planRun(rules({ dailyCap: 6 }));
    expect(longer.days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 1, 2]);
    expect(longer.sentence).toBe(
      "40 emails leave on 7 sending days: 6 a day from Monday to next Monday, then 4 on next Tuesday. You press Start 7 times.",
    );
    expect(longer.note).toBe("Nothing leaves on Saturday or Sunday, outside the window.");
  });

  it("a cap of 1 takes 40 weekdays and 40 presses", async () => {
    const plan = await planRun(rules({ dailyCap: 1 }));
    expect(plan.presses).toBe(40);
    expect(plan.days).toHaveLength(40);
    expect(plan.sentence).toBe(
      "40 emails leave on 40 sending days, 1 a day from Monday to Friday of week 8. You press Start 40 times.",
    );
  });

  it("a window too short for the cap pauses on the window, not the cap", async () => {
    const plan = await planRun(rules({ start: "09:00", end: "10:00", delayMinSeconds: 300, delayMaxSeconds: 600 }));
    expect(plan.capPauses).toBe(0);
    expect(plan.windowPauses).toBeGreaterThan(0);
    expect(plan.days.every((day) => day.count < 25)).toBe(true);
    expect(plan.note).toBe("The window closes before the daily cap of 25 is reached.");
    for (const day of plan.days) {
      for (const at of day.times) {
        const minutes = new Date(at).getUTCHours() * 60 + new Date(at).getUTCMinutes();
        expect(minutes).toBeGreaterThanOrEqual(9 * 60);
        expect(minutes).toBeLessThanOrEqual(10 * 60);
      }
    }
  });

  it("starts at the first allowed day's opening", async () => {
    const plan = await planRun(rules({ days: [3], dailyCap: 25, start: "14:00", end: "18:00" }));
    expect(plan.days.map((day) => day.weekday)).toEqual([3, 3]);
    expect(plan.sentence).toBe(
      "40 emails leave on 2 sending days: 25 on Wednesday, 15 on next Wednesday. You press Start twice.",
    );
  });

  it("respects the delay range between messages", async () => {
    const plan = await planRun(rules({ delayMinSeconds: 60, delayMaxSeconds: 60, dailyCap: 50 }));
    const times = plan.days[0].times.sort((a, b) => a - b);
    for (let index = 1; index < times.length; index += 1) expect(times[index] - times[index - 1]).toBe(60_000);
  });

  it("does not report the window when the cap ends every day", async () => {
    expect(WINDOW_REASON).toBe("Outside the Gmail account's sending window.");
    const plan = await planRun(rules({ dailyCap: 20 }));
    expect(plan.windowPauses).toBe(0);
  });
});

describe("the rules line", async () => {
  const { rulesLine, daysText } = await import("./format");
  it("reads the defaults in one line", () => {
    expect(rulesLine(DEFAULT_RULES)).toBe("25 a day. Monday to Friday, 09:00 to 17:00. 30 to 45 seconds apart.");
  });
  it("names odd day sets plainly", () => {
    expect(daysText([1, 3, 5])).toBe("Monday, Wednesday and Friday");
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(daysText([6, 0])).toBe("Saturday and Sunday");
  });
});

describe("the plan's notes", () => {
  it("says the window cut some days short when only some days reach the cap", async () => {
    const plan = await planRun(rules({ dailyCap: 10, end: "10:00", delayMinSeconds: 300, delayMaxSeconds: 600 }));
    expect(plan.days.map((day) => day.count)).toEqual([8, 9, 9, 10, 4]);
    expect(plan.sentence).toBe(
      "40 emails leave over 5 days, between 4 and 10 a day, from Monday to Friday. You press Start 5 times.",
    );
    expect(plan.note).toBe("On some days the window closes before the daily cap of 10 is reached.");
  });
});

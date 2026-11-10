import { describe, expect, it } from "vitest";
import { CAP_REASON, DemoSession, MANUAL_REASON, WINDOW_REASON } from "./session";
import { dayAndTime } from "./time";
import { DEFAULT_RULES, DemoWorld } from "./world";

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

describe("the pause reasons", () => {
  it("are the runner's own strings", () => {
    expect(CAP_REASON).toBe("The Gmail account's daily cap has been reached.");
    expect(WINDOW_REASON).toBe("Outside the Gmail account's sending window.");
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

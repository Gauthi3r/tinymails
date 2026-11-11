import { describe, expect, it } from "vitest";
import { isWithinSendingWindow, localDay, nextSendTime } from "../src/domain/schedule";

const weekdays = { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" };

describe("sending schedule", () => {
  it("reads the calendar day in the account time zone", () => {
    expect(localDay(new Date("2026-08-29T23:30:00.000Z"), "UTC")).toBe("2026-08-29");
    expect(localDay(new Date("2026-08-29T23:30:00.000Z"), "Europe/Lisbon")).toBe("2026-08-30");
  });

  it("opens only on the chosen days and hours", () => {
    const account = { timeZone: "UTC", sendingWindow: weekdays };

    expect(isWithinSendingWindow(account, new Date("2026-08-31T09:00:00.000Z"))).toBe(true);
    expect(isWithinSendingWindow(account, new Date("2026-08-31T17:01:00.000Z"))).toBe(false);
    expect(isWithinSendingWindow(account, new Date("2026-08-29T10:00:00.000Z"))).toBe(false);
  });

  it("can send straight away inside the window when the cap has room", () => {
    const account = { timeZone: "UTC", sendingWindow: weekdays };

    expect(nextSendTime(account, new Date("2026-08-31T10:15:00.000Z"), false)?.toISOString())
      .toBe("2026-08-31T10:15:00.000Z");
  });

  it("waits for the next opening after the window closes, skipping the weekend", () => {
    const account = { timeZone: "UTC", sendingWindow: weekdays };

    expect(nextSendTime(account, new Date("2026-08-28T17:30:00.000Z"), false)?.toISOString())
      .toBe("2026-08-31T09:00:00.000Z");
  });

  it("waits for the next day when today's cap is used up, even inside the window", () => {
    const account = { timeZone: "UTC", sendingWindow: weekdays };

    expect(nextSendTime(account, new Date("2026-08-31T10:15:00.000Z"), true)?.toISOString())
      .toBe("2026-09-01T09:00:00.000Z");
  });

  it("finds the opening in the account's own time zone", () => {
    const account = { timeZone: "America/New_York", sendingWindow: weekdays };

    expect(nextSendTime(account, new Date("2026-08-31T22:00:00.000Z"), false)?.toISOString())
      .toBe("2026-09-01T13:00:00.000Z");
  });

  it("lets an overnight window continue past midnight once the cap resets", () => {
    const account = { timeZone: "UTC", sendingWindow: { days: [1], start: "22:00", end: "02:00" } };

    expect(nextSendTime(account, new Date("2026-08-31T23:00:00.000Z"), true)?.toISOString())
      .toBe("2026-09-01T00:00:00.000Z");
  });
});

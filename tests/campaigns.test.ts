import { describe, expect, it } from "vitest";
import {
  createCampaign,
  recoverInterruptedCampaigns,
  renderMessage,
  sentToday,
} from "../src/domain/campaigns";
import type { Campaign } from "../src/domain/types";

const now = "2026-08-29T10:00:00.000Z";

describe("campaign rules", () => {
  it("excludes duplicate, bounced, suppressed, and queued recipients", () => {
    const result = createCampaign(
      {
        name: "Product update",
        subject: "A short update",
        body: "Hi {firstName}",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [
          { email: "ready@example.com" },
          { email: "READY@example.com" },
          { email: "blocked@example.com" },
          { email: "bounce@example.com" },
          { email: "queued@example.com" },
        ],
        now,
      },
      {
        suppressed: new Set(["blocked@example.com"]),
        bounced: new Set(["bounce@example.com"]),
        queued: new Set(["queued@example.com"]),
      },
    );

    expect(result.campaign.recipients.map((recipient) => recipient.email)).toEqual([
      "ready@example.com",
    ]);
    expect(result.excluded.map((item) => item.reason).sort()).toEqual([
      "bounced",
      "do-not-contact",
      "duplicate",
      "queued",
    ]);
  });

  it("assigns ready recipients across accounts in order", () => {
    const result = createCampaign(
      {
        name: "Product update",
        subject: "A short update",
        body: "Hi {firstName}",
        accountIds: ["account-1", "account-2"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [
          { email: "one@example.com" },
          { email: "two@example.com" },
          { email: "three@example.com" },
        ],
        now,
      },
      { suppressed: new Set(), bounced: new Set(), queued: new Set() },
    );

    expect(result.campaign.recipients.map((recipient) => recipient.accountId)).toEqual([
      "account-1",
      "account-2",
      "account-1",
    ]);
  });

  it("refuses to save a campaign when every recipient is excluded", () => {
    expect(() =>
      createCampaign(
        {
          name: "Product update",
          subject: "A short update",
          body: "Hi there",
          accountIds: ["account-1"],
          dailyCap: 25,
          delayMinSeconds: 30,
          delayMaxSeconds: 45,
          recipients: [{ email: "blocked@example.com" }],
          now,
        },
        {
          suppressed: new Set(["blocked@example.com"]),
          bounced: new Set(),
          queued: new Set(),
        },
      ),
    ).toThrowError("No eligible recipients remain after safety checks.");
  });

  it("uses readable personalization fallbacks", () => {
    expect(renderMessage("Hi {firstName} from {company}", { email: "ada@example.com" })).toBe(
      "Hi there from your company",
    );
  });

  it("counts only messages sent by the account on the requested UTC day", () => {
    const campaign = baseCampaign([
      { email: "one@example.com", accountId: "account-1", status: "sent", sentAt: now },
      {
        email: "two@example.com",
        accountId: "account-1",
        status: "sent",
        sentAt: "2026-08-28T23:59:59.000Z",
      },
      { email: "three@example.com", accountId: "account-2", status: "sent", sentAt: now },
    ]);

    expect(sentToday([campaign], "account-1", "2026-08-29", "UTC")).toBe(1);
  });

  it("counts sent messages on the account's local day", () => {
    const campaign = baseCampaign([
      {
        email: "one@example.com",
        accountId: "account-1",
        status: "sent",
        sentAt: "2026-08-29T23:30:00.000Z",
      },
    ]);

    expect(sentToday([campaign], "account-1", "2026-08-30", "Europe/Lisbon")).toBe(1);
  });

  it("marks in-flight recipients as unknown after restart", () => {
    const campaign = baseCampaign([
      { email: "ada@example.com", accountId: "account-1", status: "sending" },
    ]);

    const [recovered] = recoverInterruptedCampaigns([campaign]);

    expect(recovered.status).toBe("paused");
    expect(recovered.recipients[0]).toMatchObject({
      status: "failed",
      error: "Delivery result is unknown. Check Gmail Sent before retrying.",
    });
    expect(campaign.recipients[0].status).toBe("sending");
  });
});

function baseCampaign(recipients: Campaign["recipients"]): Campaign {
  return {
    id: "campaign-1",
    name: "Product update",
    subject: "A short update",
    body: "Hi there",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    createdAt: now,
    status: "running",
    recipients,
  };
}

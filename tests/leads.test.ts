import { describe, expect, it } from "vitest";
import { availableLeads, deriveLeadStatus, indexLeadStatuses, mergeLeads } from "../src/domain/leads";
import type { Campaign, Lead } from "../src/domain/types";

const now = "2026-08-29T10:00:00.000Z";

describe("lead rules", () => {
  it("enriches an existing lead without overwriting known values", () => {
    const result = mergeLeads(
      [{ email: "Person@Example.com", firstName: "Ada", listIds: ["list-original"], addedAt: now }],
      [{ email: "person@example.com", firstName: "Changed", company: "Analytical Engines" }],
      "list-conference",
      now,
    );

    expect(result.leads[0]).toMatchObject({
      email: "person@example.com",
      firstName: "Ada",
      company: "Analytical Engines",
      listIds: ["list-original", "list-conference"],
    });
    expect(result).toMatchObject({ added: 0, existing: 1, enriched: 1 });
  });

  it("does not duplicate a contact's existing list membership", () => {
    const result = mergeLeads(
      [{ email: "ada@example.com", listIds: ["list-beta"], addedAt: now }],
      [{ email: "ADA@example.com" }],
      "list-beta",
      now,
    );

    expect(result.leads).toEqual([
      { email: "ada@example.com", listIds: ["list-beta"], addedAt: now },
    ]);
    expect(result).toMatchObject({ added: 0, existing: 1, enriched: 0 });
  });

  it("counts invalid and duplicate incoming addresses without storing them", () => {
    const result = mergeLeads(
      [],
      [{ email: "invalid" }, { email: "ada@example.com" }, { email: "ADA@example.com" }],
      "Product beta",
      now,
    );

    expect(result.leads.map((lead) => lead.email)).toEqual(["ada@example.com"]);
    expect(result).toMatchObject({ added: 1, duplicate: 1, invalid: 1 });
  });

  it("derives suppression before every other lead state", () => {
    const lead: Lead = {
      email: "ada@example.com",
      firstName: "Ada",
      listIds: ["list-product-beta"],
      addedAt: now,
    };
    const campaign = campaignWithRecipient(lead.email, "sent");

    expect(deriveLeadStatus(lead, [campaign], new Set([lead.email]))).toBe("do-not-contact");
  });

  it("indexes campaign-derived statuses once with the same safety priority", () => {
    const queued = campaignWithRecipient("ADA@example.com", "pending");
    const sent = campaignWithRecipient("ada@example.com", "sent");
    const index = indexLeadStatuses([queued, sent], new Set(["blocked@example.com"]));

    expect(index.get("ada@example.com")).toBe("contacted");
    expect(index.get("blocked@example.com")).toBe("do-not-contact");
    expect(index.get("new@example.com") ?? "new").toBe("new");
  });

  it("returns only new leads that are not blocked or queued", () => {
    const leads: Lead[] = [
      { email: "new@example.com", listIds: ["list-beta", "list-founders"], addedAt: now },
      { email: "queued@example.com", listIds: ["list-beta"], addedAt: now },
      { email: "other@example.com", listIds: ["list-conference"], addedAt: now },
    ];
    const campaigns = [campaignWithRecipient("queued@example.com", "pending")];

    expect(availableLeads(leads, campaigns, new Set(), "list-beta").map((lead) => lead.email)).toEqual([
      "new@example.com",
    ]);
  });
});

function campaignWithRecipient(
  email: string,
  status: Campaign["recipients"][number]["status"],
  extra: Partial<Campaign["recipients"][number]> = {},
): Campaign {
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
    recipients: [{ email, accountId: "account-1", status, ...extra }],
  };
}

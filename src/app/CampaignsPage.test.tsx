// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Campaign } from "../domain/types";
import type { AppApi } from "./api";
import { CampaignsPage } from "./CampaignsPage";

describe("campaign composer", () => {
  it("reviews personalized copy before saving a paused campaign", async () => {
    const api = fakeApi();
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    expect(await screen.findByRole("heading", { name: "Recipients" })).toBeVisible();
    expect(screen.getByText("2 available leads selected")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue to Write" }));

    await userEvent.type(screen.getByLabelText("Campaign name"), "Beta note");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A note for {company}" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi {firstName}, a careful update." } });
    await userEvent.click(screen.getByRole("button", { name: "Continue to Delivery" }));
    expect(screen.getByText("sender@example.com")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue to Review" }));

    expect(screen.getByText("2 recipients")).toBeVisible();
    expect(screen.getByText("Hi Ada, a careful update.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Save campaign" }));

    expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({
      name: "Beta note",
      subject: "A note for {company}",
      body: "Hi {firstName}, a careful update.",
      accountIds: ["account-1"],
      recipients: [
        expect.objectContaining({ email: "ada@example.com" }),
        expect.objectContaining({ email: "grace@example.org" }),
      ],
    }));
    expect(await screen.findByText("Beta note")).toBeVisible();
  });

  it("starts, pauses, and opens recipient-level campaign detail", async () => {
    const campaign = campaignFixture();
    const api = fakeApi([campaign]);
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "View Beta note" }));
    expect(screen.getByText("ada@example.com")).toBeVisible();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Start Beta note" }));
    expect(api.startCampaign).toHaveBeenCalledWith("campaign-1");
    await userEvent.click(await screen.findByRole("button", { name: "Pause Beta note" }));
    expect(api.pauseCampaign).toHaveBeenCalledWith("campaign-1");
  });
});

function campaignFixture(): Campaign {
  return {
    id: "campaign-1",
    name: "Beta note",
    subject: "A note for {company}",
    body: "Hi {firstName}, a careful update.",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    createdAt: "2026-08-29T10:00:00.000Z",
    status: "paused",
    recipients: [
      { email: "ada@example.com", firstName: "Ada", company: "Analytical Engines", accountId: "account-1", status: "pending" },
      { email: "grace@example.org", firstName: "Grace", company: "Compiler Studio", accountId: "account-1", status: "pending" },
    ],
  };
}

function fakeApi(initialCampaigns: Campaign[] = []) {
  const campaign = campaignFixture();
  return {
    getCampaigns: vi.fn(async () => initialCampaigns),
    getLeads: vi.fn(async () => ({
      leads: [
        { email: "ada@example.com", firstName: "Ada", company: "Analytical Engines", source: "Beta", addedAt: campaign.createdAt, status: "new" as const },
        { email: "grace@example.org", firstName: "Grace", company: "Compiler Studio", source: "Beta", addedAt: campaign.createdAt, status: "new" as const },
        { email: "known@example.net", source: "Beta", addedAt: campaign.createdAt, status: "contacted" as const },
      ],
      counts: { total: 3, new: 2, contacted: 1 },
      sources: ["Beta"],
    })),
    getReplies: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({
      accounts: [{
        id: "account-1",
        email: "sender@example.com",
        label: "Gmail",
        capabilities: ["send" as const],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        timeZone: "Europe/Lisbon",
        sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
        lastTestedAt: "2026-08-29T09:00:00.000Z",
      }],
      dataDir: "/tmp/tinymails-test",
      version: "0.1.0",
      suppressionCount: 0,
    })),
    startGoogleOAuth: vi.fn(),
    getGoogleOAuthStatus: vi.fn(),
    sendTestEmail: vi.fn(),
    importLeads: vi.fn(),
    createCampaign: vi.fn(async () => ({ campaign, excluded: [] })),
    startCampaign: vi.fn(async () => ({ ...campaign, status: "running" as const })),
    pauseCampaign: vi.fn(async () => campaign),
  } as unknown as AppApi & { createCampaign: ReturnType<typeof vi.fn> };
}

// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Campaign } from "../domain/types";
import type { AppApi } from "./api";
import { CampaignsPage } from "./CampaignsPage";

describe("campaign composer", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the new campaign action inside the empty campaign surface", async () => {
    render(<CampaignsPage api={fakeApi()} />);

    const emptyState = await screen.findByRole("region", { name: "Empty campaigns" });
    const action = within(emptyState).getByRole("button", { name: "New campaign" });

    expect(action.closest("header")).toBeNull();
  });

  it("places the new campaign action in the page header when campaign history exists", async () => {
    render(<CampaignsPage api={fakeApi([campaignFixture()])} />);

    const action = await screen.findByRole("button", { name: "New campaign" });

    expect(action.closest("header")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "Empty campaigns" })).not.toBeInTheDocument();
  });

  it("reviews personalized copy, sends the test, then starts the campaign", async () => {
    const api = fakeApi();
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    expect(await screen.findByRole("heading", { name: "Recipients" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Campaign composer" })).toHaveClass("h-full");
    expect(screen.getByRole("group", { name: "Campaign composer actions" })).toHaveClass("shrink-0");
    expect(screen.getByLabelText("Recipient list")).toHaveValue("list-beta");
    expect(screen.getByRole("button", { name: "Upload CSV" })).toBeVisible();
    await waitFor(() => expect(api.getLeads).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      listId: "list-beta",
    }));
    expect(screen.getByText("0 available leads selected")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Select all available" }));
    expect(await screen.findByText("2 available leads selected")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue to Write" }));

    await userEvent.type(screen.getByLabelText("Campaign name"), "Beta note");
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "A note for {company}" } });
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Hi {firstName}, a careful update." } });
    await userEvent.click(screen.getByRole("button", { name: "Continue to Delivery" }));
    expect(screen.getByText("Sender")).toBeVisible();
    expect(screen.getByText("sender@example.com")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Continue to Review" }));

    expect(screen.getByText("2 recipients")).toBeVisible();
    expect(screen.getByText("Hi Ada, a careful update.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Start campaign" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));

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
    expect(api.testCampaign).toHaveBeenCalledWith("campaign-1");
    expect(api.startCampaign).not.toHaveBeenCalled();
    expect(await screen.findByText(/Test sent to sender@example.com/)).toBeVisible();
    expect(window.localStorage.length).toBe(0);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    const startButton = screen.getByRole("button", { name: "Start campaign" });
    await waitFor(() => expect(startButton).toBeEnabled());
    await userEvent.click(startButton);

    expect(api.startCampaign).toHaveBeenCalledWith("campaign-1");
    expect(await screen.findByText("Beta note")).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause Beta note" })).toBeVisible();
  });

  it("opens the existing reviewed CSV import from the recipients step", async () => {
    render(<CampaignsPage api={fakeApi()} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await userEvent.click(screen.getByRole("button", { name: "Upload CSV" }));

    expect(screen.getByRole("heading", { name: "Review a CSV import" })).toBeVisible();
    expect(screen.getByLabelText("CSV file")).toBeVisible();
  });

  it("selects every available contact across a paginated list", async () => {
    const api = fakeApi();
    const base = await api.getLeads();
    api.getLeads.mockImplementation(async (filters?: { page?: number }) => ({
      ...base,
      leads: filters?.page === 2 ? [base.leads[1]] : [base.leads[0]],
      pagination: { page: filters?.page ?? 1, pageSize: 100, total: 2, pages: 2 },
    }));
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await userEvent.click(await screen.findByRole("button", { name: "Select all available" }));

    expect(await screen.findByText("2 available leads selected")).toBeVisible();
    expect(api.getLeads).toHaveBeenCalledWith({
      page: 2,
      pageSize: 100,
      listId: "list-beta",
      status: "new",
    });
  });

  it("inserts personalization variables at the active field's caret", async () => {
    render(<CampaignsPage api={fakeApi()} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all available" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to Write" }));

    const subject = screen.getByLabelText("Subject") as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Hello team" } });
    subject.focus();
    subject.setSelectionRange(6, 6);
    fireEvent.select(subject);
    await userEvent.click(screen.getByRole("button", { name: "Insert {company}" }));
    expect(subject).toHaveValue("Hello {company}team");

    const message = screen.getByLabelText("Message") as HTMLTextAreaElement;
    fireEvent.change(message, { target: { value: "Hi there" } });
    message.focus();
    message.setSelectionRange(3, 3);
    fireEvent.select(message);
    await userEvent.click(screen.getByRole("button", { name: "Insert {firstName}" }));
    expect(message).toHaveValue("Hi {firstName}there");
  });

  it("shows and restores a browser-local campaign draft after a refresh", async () => {
    const api = fakeApi();
    const firstRender = render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all available" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to Write" }));
    await userEvent.type(screen.getByLabelText("Campaign name"), "Unfinished note");
    await waitFor(() => expect(window.localStorage.length).toBe(1));

    firstRender.unmount();
    render(<CampaignsPage api={api} />);

    expect(await screen.findByText("Draft")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Resume Unfinished note" }));
    expect(await screen.findByRole("heading", { name: "Write" })).toBeVisible();
    expect(screen.getByLabelText("Campaign name")).toHaveValue("Unfinished note");
  });

  it("discards a saved browser-local draft", async () => {
    const api = fakeApi();
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await waitFor(() => expect(window.localStorage.length).toBe(1));
    await userEvent.click(screen.getByRole("button", { name: "Close campaign composer" }));
    await userEvent.click(screen.getByRole("button", { name: "Discard Untitled campaign" }));

    expect(window.localStorage.length).toBe(0);
    expect(screen.getByRole("button", { name: "New campaign" })).toBeVisible();
  });

  it("shows the server's final recipient count before closing the review", async () => {
    const api = fakeApi();
    const saved = campaignFixture();
    saved.recipients = saved.recipients.slice(0, 1);
    api.createCampaign.mockResolvedValue({
      campaign: saved,
      excluded: [{ email: "grace@example.org", reason: "do-not-contact" }],
    });
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "New campaign" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all available" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to Write" }));
    await userEvent.type(screen.getByLabelText("Campaign name"), "Beta note");
    await userEvent.type(screen.getByLabelText("Subject"), "Hello");
    await userEvent.type(screen.getByLabelText("Message"), "Hi there");
    await userEvent.click(screen.getByRole("button", { name: "Continue to Delivery" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue to Review" }));
    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));

    expect(await screen.findByText(/1 recipient was excluded by the final safety checks/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Review" })).toBeVisible();
    const startButton = screen.getByRole("button", { name: "Start campaign" });
    await waitFor(() => expect(startButton).toBeEnabled());
    await userEvent.click(startButton);
    expect(api.startCampaign).toHaveBeenCalledWith("campaign-1");
    expect(await screen.findByText("Beta note")).toBeVisible();
  });

  it("starts and pauses from the row, and stops from the expanded detail", async () => {
    const campaign = campaignFixture();
    const api = fakeApi([campaign]);
    render(<CampaignsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "View Beta note" }));
    expect(screen.getByText("ada@example.com")).toBeVisible();
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Test Beta note" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Start Beta note" }));
    expect(api.startCampaign).toHaveBeenCalledWith("campaign-1");
    await userEvent.click(await screen.findByRole("button", { name: "Pause Beta note" }));
    expect(api.pauseCampaign).toHaveBeenCalledWith("campaign-1");
    await userEvent.click(await screen.findByRole("button", { name: "Stop Beta note" }));
    expect(api.stopCampaign).toHaveBeenCalledWith("campaign-1");
  });

  it("shows the reason a paused campaign needs the user", async () => {
    const campaign = campaignFixture();
    campaign.pauseReason = "TinyMails was restarted. Press Start to continue.";
    render(<CampaignsPage api={fakeApi([campaign])} />);

    expect(await screen.findByText("TinyMails was restarted. Press Start to continue.")).toBeVisible();
  });

  it("shows a waiting campaign as waiting, with when it continues and a way to pause", async () => {
    const campaign = campaignFixture();
    campaign.status = "running";
    campaign.waitingReason = "The Gmail account's daily cap has been reached.";
    campaign.resumesAt = "2026-08-31T09:00:00.000Z";
    render(<CampaignsPage api={fakeApi([campaign])} />);

    expect(await screen.findByText(/^waiting · 0\/2 sent$/)).toBeVisible();
    expect(screen.getByText(/^The Gmail account's daily cap has been reached\. It continues on its own, .+\.$/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Pause Beta note" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start Beta note" })).not.toBeInTheDocument();
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
  const list = {
    id: "list-beta",
    name: "Beta",
    createdAt: campaign.createdAt,
    updatedAt: campaign.createdAt,
    contactCount: 3,
  };
  return {
    getCampaigns: vi.fn(async () => initialCampaigns),
    getLeads: vi.fn(async () => ({
      leads: [
        { email: "ada@example.com", firstName: "Ada", company: "Analytical Engines", listIds: [list.id], addedAt: campaign.createdAt, status: "new" as const },
        { email: "grace@example.org", firstName: "Grace", company: "Compiler Studio", listIds: [list.id], addedAt: campaign.createdAt, status: "new" as const },
        { email: "known@example.net", listIds: [list.id], addedAt: campaign.createdAt, status: "contacted" as const },
      ],
      counts: { total: 3, new: 2, contacted: 1 },
      lists: [list],
      pagination: { page: 1, pageSize: 100, total: 3, pages: 1 },
    })),
    setAgentsCanStart: vi.fn(async (allowed: boolean) => allowed),
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
        agentsCanStart: false,
    })),
    startGoogleOAuth: vi.fn(),
    getGoogleOAuthStatus: vi.fn(),
    sendTestEmail: vi.fn(),
    updateAccount: vi.fn(),
    importLeads: vi.fn(),
    bulkUpdateLeads: vi.fn(),
    createCampaign: vi.fn(async () => ({ campaign, excluded: [] })),
    testCampaign: vi.fn(async () => ({ ...campaign, testedAt: "2026-08-29T10:01:00.000Z" })),
    startCampaign: vi.fn(async () => ({ ...campaign, testedAt: "2026-08-29T10:01:00.000Z", status: "running" as const })),
    pauseCampaign: vi.fn(async () => campaign),
    stopCampaign: vi.fn(async () => ({
      ...campaign,
      status: "stopped" as const,
      recipients: campaign.recipients.map((recipient) => ({ ...recipient, status: "not-sent" as const })),
    })),
    suppressEmails: vi.fn(),
    getTemplates: vi.fn(async () => []),
    saveTemplate: vi.fn(),
  } as unknown as AppApi & {
    createCampaign: ReturnType<typeof vi.fn>;
    getLeads: ReturnType<typeof vi.fn>;
  };
}

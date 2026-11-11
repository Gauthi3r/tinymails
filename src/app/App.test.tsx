// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { AppApi } from "./api";

describe("TinyMails app shell", () => {
  it("navigates between the primary TinyMails pages", async () => {
    const fakeApi: AppApi = {
      getCampaigns: async () => [],
      getLeads: async () => ({
        leads: [],
        counts: { total: 0 },
        lists: [],
        pagination: { page: 1, pageSize: 50, total: 0, pages: 1 },
      }),
      startGoogleOAuth: async () => ({ sessionId: "session", authorizationUrl: "https://example.com" }),
      getGoogleOAuthStatus: async () => ({ status: "pending" }),
      sendTestEmail: async () => ({ ok: true, messageId: "message" }),
      disconnectGoogleAccount: async () => undefined,
      updateAccount: async () => { throw new Error("Not used"); },
      importLeads: async () => ({
        leads: [],
        list: { id: "list-1", name: "List", createdAt: "", updatedAt: "" },
        added: 0,
        existing: 0,
        enriched: 0,
        duplicate: 0,
        invalid: 0,
      }),
      bulkUpdateLeads: async () => ({ affected: 0, skipped: 0, skippedEmails: [] }),
      createCampaign: async () => { throw new Error("Not used"); },
      testCampaign: async () => { throw new Error("Not used"); },
      startCampaign: async () => { throw new Error("Not used"); },
      pauseCampaign: async () => { throw new Error("Not used"); },
      stopCampaign: async () => { throw new Error("Not used"); },
      suppressEmails: async () => [],
      getTemplates: async () => [],
      saveTemplate: async () => { throw new Error("Not used"); },
      setAgentsCanStart: async (allowed: boolean) => allowed,
      getSettings: async () => ({
        accounts: [],
        dataDir: "/tmp/tinymails-test",
        version: "0.1.0",
        suppressionCount: 0,
        agentsCanStart: false,
      }),
    };
    render(<App api={fakeApi} />);

    const primaryNavigation = screen.getByRole("navigation", { name: "Primary" });
    expect(screen.getAllByRole("banner")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "TinyMails home" })).toBeVisible();
    expect(screen.getByRole("img", { name: "TinyMails" })).toBeVisible();
    expect(primaryNavigation.firstElementChild).toBe(screen.getByRole("button", { name: "TinyMails home" }));
    expect(screen.queryByText("TinyMails")).not.toBeInTheDocument();
    expect(primaryNavigation).toContainElement(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryByText("Outbox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Leads" }));
    expect(screen.getByRole("heading", { name: "Leads" })).toBeVisible();
    expect(screen.queryByText("Contact library")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replies" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
    expect(screen.queryByText("Local configuration")).not.toBeInTheDocument();
  });

  it("shows the local-first account state when Gmail is not connected", async () => {
    const fakeApi: AppApi = {
      getCampaigns: async () => [],
      getLeads: async () => ({
        leads: [],
        counts: { total: 0 },
        lists: [],
        pagination: { page: 1, pageSize: 50, total: 0, pages: 1 },
      }),
      startGoogleOAuth: async () => ({ sessionId: "session", authorizationUrl: "https://example.com" }),
      getGoogleOAuthStatus: async () => ({ status: "pending" }),
      sendTestEmail: async () => ({ ok: true, messageId: "message" }),
      disconnectGoogleAccount: async () => undefined,
      updateAccount: async () => { throw new Error("Not used"); },
      importLeads: async () => ({
        leads: [],
        list: { id: "list-1", name: "List", createdAt: "", updatedAt: "" },
        added: 0,
        existing: 0,
        enriched: 0,
        duplicate: 0,
        invalid: 0,
      }),
      bulkUpdateLeads: async () => ({ affected: 0, skipped: 0, skippedEmails: [] }),
      createCampaign: async () => { throw new Error("Not used"); },
      testCampaign: async () => { throw new Error("Not used"); },
      startCampaign: async () => { throw new Error("Not used"); },
      pauseCampaign: async () => { throw new Error("Not used"); },
      stopCampaign: async () => { throw new Error("Not used"); },
      suppressEmails: async () => [],
      getTemplates: async () => [],
      saveTemplate: async () => { throw new Error("Not used"); },
      setAgentsCanStart: async (allowed: boolean) => allowed,
      getSettings: async () => ({
        accounts: [],
        dataDir: "/tmp/tinymails-test",
        version: "0.1.0",
        suppressionCount: 0,
        agentsCanStart: false,
      }),
    };
    render(<App api={fakeApi} />);

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("No Gmail account connected")).toBeVisible();
  });
});

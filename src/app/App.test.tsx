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
      getLeads: async () => ({ leads: [], counts: { total: 0 }, sources: [] }),
      getReplies: async () => [],
      startGoogleOAuth: async () => ({ sessionId: "session", authorizationUrl: "https://example.com" }),
      getGoogleOAuthStatus: async () => ({ status: "pending" }),
      sendTestEmail: async () => ({ ok: true, messageId: "message" }),
      importLeads: async () => ({ leads: [], added: 0, existing: 0, enriched: 0, duplicate: 0, invalid: 0 }),
      createCampaign: async () => { throw new Error("Not used"); },
      testCampaign: async () => { throw new Error("Not used"); },
      startCampaign: async () => { throw new Error("Not used"); },
      pauseCampaign: async () => { throw new Error("Not used"); },
      suppressEmails: async () => [],
      getTemplates: async () => [],
      saveTemplate: async () => { throw new Error("Not used"); },
      getSettings: async () => ({
        accounts: [],
        dataDir: "/tmp/tinymails-test",
        version: "0.1.0",
        suppressionCount: 0,
      }),
    };
    render(<App api={fakeApi} />);

    expect(screen.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Leads" }));
    expect(screen.getByRole("heading", { name: "Leads" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  it("shows the local-first account state when Gmail is not connected", async () => {
    const fakeApi: AppApi = {
      getCampaigns: async () => [],
      getLeads: async () => ({ leads: [], counts: { total: 0 }, sources: [] }),
      getReplies: async () => [],
      startGoogleOAuth: async () => ({ sessionId: "session", authorizationUrl: "https://example.com" }),
      getGoogleOAuthStatus: async () => ({ status: "pending" }),
      sendTestEmail: async () => ({ ok: true, messageId: "message" }),
      importLeads: async () => ({ leads: [], added: 0, existing: 0, enriched: 0, duplicate: 0, invalid: 0 }),
      createCampaign: async () => { throw new Error("Not used"); },
      testCampaign: async () => { throw new Error("Not used"); },
      startCampaign: async () => { throw new Error("Not used"); },
      pauseCampaign: async () => { throw new Error("Not used"); },
      suppressEmails: async () => [],
      getTemplates: async () => [],
      saveTemplate: async () => { throw new Error("Not used"); },
      getSettings: async () => ({
        accounts: [],
        dataDir: "/tmp/tinymails-test",
        version: "0.1.0",
        suppressionCount: 0,
      }),
    };
    render(<App api={fakeApi} />);

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText("No Gmail account connected")).toBeVisible();
  });
});

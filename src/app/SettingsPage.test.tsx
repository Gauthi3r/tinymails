// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppApi, PublicAccount, SettingsResponse } from "./api";
import { SettingsPage } from "./SettingsPage";

describe("Gmail setup", () => {
  it("connects from a Desktop OAuth client file and sends a test message", async () => {
    const account = accountFixture();
    const api = connectionApi(account);
    const popup = { location: { href: "about:blank" }, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const onSettingsChange = vi.fn();
    render(
      <SettingsPage
        api={api}
        settings={settingsFixture([])}
        error={false}
        onSettingsChange={onSettingsChange}
      />,
    );

    expect(screen.getByRole("heading", { name: "Connect Gmail" })).toBeVisible();
    expect(screen.queryByText(/requests your verified email/)).not.toBeInTheDocument();
    const file = new File(
      [JSON.stringify({ installed: { client_id: "123456789.apps.googleusercontent.com" } })],
      "oauth-client.json",
      { type: "application/json" },
    );
    await userEvent.upload(screen.getByLabelText("Google OAuth client JSON"), file);

    expect(await screen.findByText("sender@example.com is connected.")).toBeVisible();
    expect(popup.location.href).toBe("https://accounts.google.test/authorize");
    expect(api.startGoogleOAuth).toHaveBeenCalledWith({
      installed: { client_id: "123456789.apps.googleusercontent.com" },
    });
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "Send test email" }));
    expect(await screen.findByText("Test email sent to sender@example.com.")).toBeVisible();
    expect(api.sendTestEmail).toHaveBeenCalledWith("account-1");
  });

  it("rejects an oversized client file before sending it to the local service", async () => {
    const api = connectionApi(accountFixture());
    render(
      <SettingsPage
        api={api}
        settings={settingsFixture([])}
        error={false}
        onSettingsChange={() => undefined}
      />,
    );
    const file = new File([new Uint8Array(256_001)], "too-large.json", { type: "application/json" });

    await userEvent.upload(screen.getByLabelText("Google OAuth client JSON"), file);

    expect(await screen.findByText("That OAuth client file is unexpectedly large.")).toBeVisible();
    expect(api.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("offers a direct Google link when Chrome blocks the automatic window", async () => {
    const account = accountFixture();
    const api = connectionApi(account);
    vi.spyOn(window, "open").mockReturnValue(null);
    render(
      <SettingsPage
        api={api}
        settings={settingsFixture([])}
        error={false}
        onSettingsChange={() => undefined}
      />,
    );
    const file = new File(
      [JSON.stringify({ installed: { client_id: "123456789.apps.googleusercontent.com" } })],
      "oauth-client.json",
      { type: "application/json" },
    );

    await userEvent.upload(screen.getByLabelText("Google OAuth client JSON"), file);

    const continueLink = await screen.findByRole("link", { name: "Continue with Google" });
    expect(continueLink).toHaveAttribute("href", "https://accounts.google.test/authorize");
    expect(screen.queryByText(/browser blocked/)).not.toBeInTheDocument();
    expect(api.getGoogleOAuthStatus).not.toHaveBeenCalled();

    await userEvent.click(continueLink);

    expect(await screen.findByText("sender@example.com is connected.")).toBeVisible();
    expect(api.getGoogleOAuthStatus).toHaveBeenCalledWith("session-1");
  });

  it("edits the Gmail account sending window and limits", async () => {
    const account = accountFixture();
    const api = connectionApi(account);
    const onSettingsChange = vi.fn();
    render(
      <SettingsPage
        api={api}
        settings={settingsFixture([account])}
        error={false}
        onSettingsChange={onSettingsChange}
      />,
    );

    expect(screen.getByText("Mon–Fri · 09:00–17:00 · Europe/Lisbon")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Edit sending rules" }));
    fireEvent.change(screen.getByLabelText("Account daily cap"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Sending starts"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("Sending ends"), { target: { value: "02:00" } });
    await userEvent.click(screen.getByRole("button", { name: "Save sending rules" }));

    expect(api.updateAccount).toHaveBeenCalledWith("account-1", expect.objectContaining({
      dailyCap: 40,
      sendingWindow: expect.objectContaining({ start: "22:00", end: "02:00" }),
    }));
    await waitFor(() => expect(onSettingsChange).toHaveBeenCalled());
  });

  it("requires confirmation before disconnecting Gmail locally", async () => {
    const account = accountFixture();
    const api = connectionApi(account);
    render(
      <SettingsPage
        api={api}
        settings={settingsFixture([account])}
        error={false}
        onSettingsChange={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Disconnect sender@example.com" }));
    expect(api.disconnectGoogleAccount).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm disconnect sender@example.com" }));

    expect(api.disconnectGoogleAccount).toHaveBeenCalledWith("account-1");
    expect(await screen.findByText("sender@example.com disconnected from this computer.")).toBeVisible();
  });
});

function connectionApi(account: PublicAccount) {
  return {
    getCampaigns: vi.fn(async () => []),
    getLeads: vi.fn(async () => ({
      leads: [],
      counts: { total: 0 },
      lists: [],
      pagination: { page: 1, pageSize: 50, total: 0, pages: 1 },
    })),
    getSettings: vi.fn(async () => settingsFixture([account])),
    startGoogleOAuth: vi.fn(async () => ({
      sessionId: "session-1",
      authorizationUrl: "https://accounts.google.test/authorize",
    })),
    getGoogleOAuthStatus: vi.fn(async () => ({ status: "connected" as const, account })),
    sendTestEmail: vi.fn(async () => ({ ok: true as const, messageId: "message-1" })),
    disconnectGoogleAccount: vi.fn(async () => undefined),
    updateAccount: vi.fn(async (_accountId, input) => ({ ...account, ...input })),
    importLeads: vi.fn(),
    bulkUpdateLeads: vi.fn(),
    createCampaign: vi.fn(),
    testCampaign: vi.fn(),
    startCampaign: vi.fn(),
    pauseCampaign: vi.fn(),
    stopCampaign: vi.fn(),
    suppressEmails: vi.fn(),
    getTemplates: vi.fn(async () => []),
    saveTemplate: vi.fn(),
  } satisfies AppApi;
}

function settingsFixture(accounts: PublicAccount[]): SettingsResponse {
  return { accounts, dataDir: "/tmp/tinymails-test", version: "0.1.0", suppressionCount: 0 };
}

function accountFixture(): PublicAccount {
  return {
    id: "account-1",
    email: "sender@example.com",
    label: "Gmail",
    capabilities: ["send"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    timeZone: "Europe/Lisbon",
    sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
  };
}

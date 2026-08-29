// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppApi } from "./api";
import { LeadsPage } from "./LeadsPage";

describe("lead CSV import", () => {
  it("previews mapped rows and imports only valid unique contacts", async () => {
    const api = fakeApi();
    render(<LeadsPage api={api} />);

    await userEvent.click(screen.getByRole("button", { name: "Import CSV" }));
    const file = new File(
      ["Email,First Name,Company\nperson@example.com,Ada,Example\ninvalid,Nope,Example\nsecond@example.org,Grace,Studio"],
      "beta-list.csv",
      { type: "text/csv" },
    );
    await userEvent.upload(screen.getByLabelText("CSV file"), file);

    expect(await screen.findByText("2 ready")).toBeVisible();
    expect(screen.getByText("1 invalid")).toBeVisible();
    expect(screen.getByDisplayValue("beta-list")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Import 2 leads" }));

    expect(api.importLeads).toHaveBeenCalledWith("beta-list", [
      { email: "person@example.com", firstName: "Ada", company: "Example" },
      { email: "second@example.org", firstName: "Grace", company: "Studio" },
    ]);
    expect(await screen.findByText("2 leads added.")).toBeVisible();
  });
});

function fakeApi() {
  return {
    getCampaigns: vi.fn(async () => []),
    getLeads: vi.fn(async () => ({ leads: [], counts: { total: 0 }, sources: [] })),
    getReplies: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({
      accounts: [],
      dataDir: "/tmp/tinymails-test",
      version: "0.1.0",
      suppressionCount: 0,
    })),
    startGoogleOAuth: vi.fn(),
    getGoogleOAuthStatus: vi.fn(),
    sendTestEmail: vi.fn(),
    importLeads: vi.fn(async () => ({
      leads: [],
      added: 2,
      existing: 0,
      enriched: 0,
      duplicate: 0,
      invalid: 0,
    })),
  } as unknown as AppApi & { importLeads: ReturnType<typeof vi.fn> };
}

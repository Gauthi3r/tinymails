// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AppApi, LeadsResponse } from "./api";
import { LeadsPage } from "./LeadsPage";

const addedAt = "2026-08-29T10:00:00.000Z";
const beta = { id: "list-beta", name: "Beta", createdAt: addedAt, updatedAt: addedAt, contactCount: 2 };
const founders = { id: "list-founders", name: "Founders", createdAt: addedAt, updatedAt: addedAt, contactCount: 1 };

describe("lead management", () => {
  it("previews mapped rows and imports valid contacts into a new list", async () => {
    const api = fakeApi(emptyResponse());
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

    expect(api.importLeads).toHaveBeenCalledWith({ listName: "beta-list" }, [
      { email: "person@example.com", firstName: "Ada", company: "Example" },
      { email: "second@example.org", firstName: "Grace", company: "Studio" },
    ]);
    expect(screen.queryByRole("heading", { name: "Review a CSV import" })).not.toBeInTheDocument();
    expect(await screen.findByText("Leads imported")).toBeVisible();
  });

  it("loads 50 leads at a time and moves between pages", async () => {
    const api = fakeApi(responseWithLeads());
    api.getLeads.mockImplementation(async (filters?: { page?: number }) => ({
      ...responseWithLeads(),
      pagination: { page: filters?.page ?? 1, pageSize: 50, total: 75, pages: 2 },
    }));
    render(<LeadsPage api={api} />);

    expect(await screen.findByText("Page 1 of 2")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));

    await waitFor(() => expect(api.getLeads).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 50,
      query: "",
      listId: "",
      status: "",
    }));
    expect(await screen.findByText("Page 2 of 2")).toBeVisible();
  });

  it("selects every filtered contact and adds them to another list", async () => {
    const api = fakeApi({
      ...responseWithLeads(),
      pagination: { page: 1, pageSize: 50, total: 120, pages: 3 },
    });
    render(<LeadsPage api={api} />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select this page" }));
    await userEvent.click(screen.getByRole("button", { name: "Select all 120 matching contacts" }));
    await userEvent.click(screen.getByRole("button", { name: "Add to list" }));
    await userEvent.selectOptions(screen.getByLabelText("Add selected contacts to"), founders.id);
    await userEvent.click(screen.getByRole("button", { name: "Confirm add to list" }));

    expect(api.bulkUpdateLeads).toHaveBeenCalledWith(
      { mode: "filter", query: "", listId: "", status: "", excludedEmails: [] },
      { type: "add-to-list", listId: founders.id },
    );
    expect(await screen.findByText("120 contacts added to Founders.")).toBeVisible();
  });

  it("removes selected contacts from the active list", async () => {
    const api = fakeApi(responseWithLeads());
    render(<LeadsPage api={api} />);

    await userEvent.selectOptions(await screen.findByLabelText("Filter by list"), beta.id);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select ada@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from Beta" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove from list" }));

    expect(api.bulkUpdateLeads).toHaveBeenCalledWith(
      { mode: "emails", emails: ["ada@example.com"] },
      { type: "remove-from-list", listId: beta.id },
    );
  });

  it("confirms permanent deletion while retaining completed delivery history", async () => {
    const api = fakeApi(responseWithLeads());
    render(<LeadsPage api={api} />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "Select ada@example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByText(/Completed delivery history will remain/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Delete 1 contact" }));
    expect(api.bulkUpdateLeads).toHaveBeenCalledWith(
      { mode: "emails", emails: ["ada@example.com"] },
      { type: "delete" },
    );
  });

  it("adds a visible lead to do-not-contact", async () => {
    const api = fakeApi(responseWithLeads());
    render(<LeadsPage api={api} />);

    await userEvent.click(await screen.findByRole("button", { name: "Do not contact ada@example.com" }));

    expect(api.suppressEmails).toHaveBeenCalledWith(["ada@example.com"]);
    expect(await screen.findByText("ada@example.com added to do-not-contact.")).toBeVisible();
  });
});

function responseWithLeads(): LeadsResponse {
  return {
    leads: [
      { email: "ada@example.com", firstName: "Ada", listIds: [beta.id], addedAt, status: "new" },
      { email: "grace@example.org", firstName: "Grace", listIds: [beta.id, founders.id], addedAt, status: "new" },
    ],
    counts: { total: 2, new: 2 },
    lists: [beta, founders],
    pagination: { page: 1, pageSize: 50, total: 2, pages: 1 },
  };
}

function emptyResponse(): LeadsResponse {
  return {
    leads: [],
    counts: { total: 0 },
    lists: [],
    pagination: { page: 1, pageSize: 50, total: 0, pages: 1 },
  };
}

function fakeApi(response: LeadsResponse) {
  return {
    getCampaigns: vi.fn(async () => []),
    getLeads: vi.fn(async () => response),
    getSettings: vi.fn(async () => ({
      accounts: [],
      dataDir: "/tmp/tinymails-test",
      version: "0.1.0",
      suppressionCount: 0,
    })),
    startGoogleOAuth: vi.fn(),
    getGoogleOAuthStatus: vi.fn(),
    sendTestEmail: vi.fn(),
    importLeads: vi.fn(async (_target, leads: unknown[]) => ({
      leads: [],
      list: { ...beta, name: "beta-list" },
      added: leads.length,
      existing: 0,
      enriched: 0,
      duplicate: 0,
      invalid: 0,
    })),
    bulkUpdateLeads: vi.fn(async () => ({ affected: response.pagination.total, skipped: 0, skippedEmails: [] })),
    suppressEmails: vi.fn(async () => ["ada@example.com"]),
  } as unknown as AppApi & {
    getLeads: ReturnType<typeof vi.fn>;
    importLeads: ReturnType<typeof vi.fn>;
    bulkUpdateLeads: ReturnType<typeof vi.fn>;
  };
}

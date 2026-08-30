// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  CAMPAIGN_DRAFT_KEY,
  loadCampaignDraft,
  saveCampaignDraft,
  type CampaignDraft,
} from "./campaign-draft";

describe("campaign draft storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores a list-based version 2 draft", () => {
    const draft: CampaignDraft = {
      version: 2,
      step: 1,
      selectedEmails: ["ada@example.com"],
      selectedAccounts: ["account-1"],
      listId: "list-beta",
      name: "Beta note",
      subject: "Hello",
      body: "Hi there",
      dailyCap: 25,
      delayMin: 30,
      delayMax: 45,
      updatedAt: "2026-08-30T10:00:00.000Z",
    };

    saveCampaignDraft(window.localStorage, draft);

    expect(loadCampaignDraft(window.localStorage)).toEqual(draft);
  });

  it("keeps a version 1 draft but clears its obsolete source filter", () => {
    window.localStorage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify({
      version: 1,
      step: 2,
      selectedEmails: ["ada@example.com"],
      selectedAccounts: ["account-1"],
      source: "Beta",
      name: "Older draft",
      subject: "Hello",
      body: "Hi there",
      dailyCap: 25,
      delayMin: 30,
      delayMax: 45,
      updatedAt: "2026-08-29T10:00:00.000Z",
    }));

    expect(loadCampaignDraft(window.localStorage)).toEqual(expect.objectContaining({
      version: 2,
      listId: "",
      step: 2,
      name: "Older draft",
      selectedEmails: ["ada@example.com"],
    }));
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { Account, Campaign } from "../src/domain/types";
import { FakeGmailAccountAdapter } from "../src/gmail/fake-adapter";
import {
  CampaignRunner,
  type AccountRepository,
  type CampaignRepository,
  type SuppressionRepository,
} from "../src/server/campaign-runner";

const now = new Date("2026-08-29T10:00:00.000Z");

describe("campaign runner", () => {
  let campaigns: MemoryCampaignRepository;
  let accounts: MemoryAccountRepository;
  let suppression: MemorySuppressionRepository;
  let gmail: FakeGmailAccountAdapter;
  let runner: CampaignRunner;

  beforeEach(() => {
    campaigns = new MemoryCampaignRepository([campaignFixture()]);
    accounts = new MemoryAccountRepository([accountFixture()]);
    suppression = new MemorySuppressionRepository();
    gmail = new FakeGmailAccountAdapter();
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      delay: async () => undefined,
    });
  });

  it("pauses on auth failure without consuming the recipient", async () => {
    gmail.queueResult({ ok: false, kind: "auth", message: "Reconnect this account." });

    await runner.run("campaign-1");

    const campaign = await campaigns.get("campaign-1");
    expect(campaign?.status).toBe("paused");
    expect(campaign?.recipients[0]).toMatchObject({
      status: "pending",
      error: "Reconnect this account.",
    });
  });

  it("checks suppression immediately before sending", async () => {
    suppression.add("ready@example.com");

    await runner.run("campaign-1");

    expect(gmail.sent).toEqual([]);
    expect((await campaigns.get("campaign-1"))?.recipients[0].status).toBe("skipped");
  });

  it("skips a recipient already contacted by another campaign", async () => {
    campaigns = new MemoryCampaignRepository([
      campaignFixture(),
      campaignFixture({
        id: "prior",
        status: "done",
        recipients: [
          {
            email: "ready@example.com",
            accountId: "account-1",
            status: "sent",
            sentAt: now.toISOString(),
          },
        ],
      }),
    ]);
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      delay: async () => undefined,
    });

    await runner.run("campaign-1");

    expect(gmail.sent).toEqual([]);
    expect((await campaigns.get("campaign-1"))?.recipients[0]).toMatchObject({
      status: "skipped",
      error: "Already contacted by another campaign.",
    });
  });

  it("persists the Gmail message ID after a successful send", async () => {
    gmail.queueResult({ ok: true, messageId: "message-1" });

    await runner.run("campaign-1");

    expect(gmail.sent).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ to: "ready@example.com", subject: "A short update" }),
      }),
    ]);
    expect((await campaigns.get("campaign-1"))?.recipients[0]).toMatchObject({
      status: "sent",
      messageId: "message-1",
      sentAt: now.toISOString(),
    });
    expect((await campaigns.get("campaign-1"))?.status).toBe("done");
  });

  it("pauses before sending when the account daily cap is exhausted", async () => {
    const prior = campaignFixture({
      id: "prior",
      status: "done",
      recipients: [
        {
          email: "sent@example.com",
          accountId: "account-1",
          status: "sent",
          sentAt: now.toISOString(),
        },
      ],
    });
    campaigns = new MemoryCampaignRepository([prior, campaignFixture()]);
    accounts = new MemoryAccountRepository([accountFixture({ dailyCap: 1 })]);
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      delay: async () => undefined,
    });

    await runner.run("campaign-1");

    expect(gmail.sent).toEqual([]);
    expect((await campaigns.get("campaign-1"))?.status).toBe("paused");
  });

  it("does not send a campaign twice when start is requested concurrently", async () => {
    gmail.queueResult({ ok: true, messageId: "message-1" });

    await Promise.all([runner.run("campaign-1"), runner.run("campaign-1")]);

    expect(gmail.sent).toHaveLength(1);
    expect((await campaigns.get("campaign-1"))?.recipients[0].status).toBe("sent");
  });

  it("shares the account daily cap across campaigns started together", async () => {
    campaigns = new MemoryCampaignRepository([
      campaignFixture(),
      campaignFixture({
        id: "campaign-2",
        recipients: [{ email: "second@example.com", accountId: "account-1", status: "pending" }],
      }),
    ]);
    accounts = new MemoryAccountRepository([accountFixture({ dailyCap: 1 })]);
    gmail.queueResult({ ok: true, messageId: "message-1" });
    gmail.queueResult({ ok: true, messageId: "message-2" });
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      delay: async () => undefined,
    });

    await Promise.all([runner.run("campaign-1"), runner.run("campaign-2")]);

    expect(gmail.sent).toHaveLength(1);
    expect([await campaigns.get("campaign-1"), await campaigns.get("campaign-2")])
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "paused" })]));
  });

  it("observes a pause before claiming the next recipient", async () => {
    let releaseDelay!: () => void;
    let notifyDelayStarted!: () => void;
    const delayStarted = new Promise<void>((resolve) => {
      notifyDelayStarted = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      releaseDelay = resolve;
    });
    campaigns = new MemoryCampaignRepository([
      campaignFixture({
        recipients: [
          { email: "one@example.com", accountId: "account-1", status: "pending" },
          { email: "two@example.com", accountId: "account-1", status: "pending" },
        ],
      }),
    ]);
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      delay: async () => {
        notifyDelayStarted();
        await delayed;
      },
    });
    const running = runner.run("campaign-1");
    await delayStarted;
    await campaigns.update("campaign-1", (campaign) => ({ ...campaign, status: "paused" }));
    releaseDelay();

    await running;

    expect(gmail.sent).toHaveLength(1);
    expect((await campaigns.get("campaign-1"))?.recipients[1].status).toBe("pending");
  });

  it("pauses with an unknown delivery result when Gmail throws", async () => {
    gmail.queueError(new Error("socket closed"));

    await runner.run("campaign-1");

    const campaign = await campaigns.get("campaign-1");
    expect(campaign?.status).toBe("paused");
    expect(campaign?.recipients[0]).toMatchObject({
      status: "failed",
      error: "Delivery result is unknown. Check Gmail Sent before retrying.",
    });
  });

  it("waits a deterministic value inside the combined delay bounds", async () => {
    const delays: number[] = [];
    campaigns = new MemoryCampaignRepository([
      campaignFixture({ delayMinSeconds: 12, delayMaxSeconds: 18 }),
    ]);
    accounts = new MemoryAccountRepository([
      accountFixture({ delayMinSeconds: 10, delayMaxSeconds: 20 }),
    ]);
    runner = new CampaignRunner({
      campaigns,
      accounts,
      suppression,
      gmail,
      clock: () => now,
      random: () => 0.5,
      delay: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    await runner.run("campaign-1");

    expect(delays).toEqual([15_000]);
  });
});

class MemoryCampaignRepository implements CampaignRepository {
  private readonly records = new Map<string, Campaign>();

  constructor(campaigns: Campaign[]) {
    for (const campaign of campaigns) this.records.set(campaign.id, structuredClone(campaign));
  }

  async get(id: string): Promise<Campaign | null> {
    const campaign = this.records.get(id);
    return campaign ? structuredClone(campaign) : null;
  }

  async list(): Promise<Campaign[]> {
    return [...this.records.values()].map((campaign) => structuredClone(campaign));
  }

  async save(campaign: Campaign): Promise<void> {
    this.records.set(campaign.id, structuredClone(campaign));
  }

  async update(id: string, update: (campaign: Campaign) => Campaign): Promise<Campaign | null> {
    const campaign = this.records.get(id);
    if (!campaign) return null;
    const updated = update(structuredClone(campaign));
    this.records.set(id, structuredClone(updated));
    return structuredClone(updated);
  }
}

class MemoryAccountRepository implements AccountRepository {
  private readonly records = new Map<string, Account>();

  constructor(accounts: Account[]) {
    for (const account of accounts) this.records.set(account.id, structuredClone(account));
  }

  async get(id: string): Promise<Account | null> {
    const account = this.records.get(id);
    return account ? structuredClone(account) : null;
  }
}

class MemorySuppressionRepository implements SuppressionRepository {
  private readonly emails = new Set<string>();

  add(email: string): void {
    this.emails.add(email);
  }

  async has(email: string): Promise<boolean> {
    return this.emails.has(email);
  }
}

function campaignFixture(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "campaign-1",
    name: "Product update",
    subject: "A short update",
    body: "Hi {firstName}",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    createdAt: now.toISOString(),
    status: "running",
    recipients: [
      {
        email: "ready@example.com",
        firstName: "Ada",
        accountId: "account-1",
        status: "pending",
      },
    ],
    ...overrides,
  };
}

function accountFixture(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    email: "sender@example.com",
    label: "Main Gmail",
    capabilities: ["send"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    timeZone: "UTC",
    sendingWindow: { days: [0, 1, 2, 3, 4, 5, 6], start: "00:00", end: "23:59" },
    credentialDirectory: "/tmp/tinymails-test/account-1",
    ...overrides,
  };
}

import { demoCampaign, doNotContact, partnersCsv, senderEmail } from "./demo-data";
import { MemoryAccounts, MemoryCampaigns, MemorySuppression } from "./memory-repositories";
import {
  CampaignRunner,
  FakeGmailAccountAdapter,
  createCampaign,
  mergeLeads,
  renderMessage,
  type Account,
  type Campaign,
  type CreateCampaignResult,
  type MergeLeadsResult,
} from "./product";
import { WEEK_START, nextOpening } from "./time";

export interface Rules {
  dailyCap: number;
  /** Allowed weekdays, as getUTCDay numbers (0 is Sunday). */
  days: number[];
  start: string;
  end: string;
  delayMinSeconds: number;
  delayMaxSeconds: number;
}

/** The defaults TinyMails seeds when a Gmail account is connected. */
export const DEFAULT_RULES: Rules = {
  dailyCap: 25,
  days: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "17:00",
  delayMinSeconds: 30,
  delayMaxSeconds: 45,
};

export const DEFAULT_SEED = 20;

/** A small seeded generator (mulberry32), so the same seed replays the same delays. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface WorldOptions {
  rules?: Rules;
  seed?: number;
  /**
   * Called with each delay the runner asks for, after the virtual clock has
   * moved. The plan resolves at once; the live page waits a scaled-down time.
   */
  pace?: (virtualMilliseconds: number) => Promise<void>;
}

/**
 * One TinyMails installation in memory: a connected Gmail account with the
 * given rules, the do-not-contact list, a fake Gmail, a virtual clock, and the
 * product's own CampaignRunner. The constructor plays the agent's two
 * requests, so the campaign exists and is paused, exactly as the API leaves it.
 */
export class DemoWorld {
  readonly rules: Rules;
  readonly campaigns = new MemoryCampaigns();
  readonly accounts: MemoryAccounts;
  readonly suppression = new MemorySuppression(doNotContact);
  readonly gmail = new FakeGmailAccountAdapter();
  readonly runner: CampaignRunner;
  readonly account: Account;
  readonly imported: MergeLeadsResult;
  readonly created: CreateCampaignResult;
  readonly campaignId: string;
  readonly startedAt: number;
  now: number;

  constructor(options: WorldOptions = {}) {
    this.rules = structuredClone(options.rules ?? DEFAULT_RULES);
    const pace = options.pace ?? (() => Promise.resolve());
    this.startedAt = nextOpening(this.rules, WEEK_START, true);
    this.now = this.startedAt;
    this.account = accountFor(this.rules);
    this.accounts = new MemoryAccounts([this.account]);

    // POST /api/leads/import, as the server runs it.
    this.imported = mergeLeads([], partnersCsv, "partners", this.iso());
    // POST /api/campaigns, as the server runs it: nothing else is queued yet.
    this.created = createCampaign(
      {
        ...demoCampaign,
        accountIds: [this.account.id],
        dailyCap: this.rules.dailyCap,
        delayMinSeconds: this.rules.delayMinSeconds,
        delayMaxSeconds: this.rules.delayMaxSeconds,
        recipients: partnersCsv,
        now: this.iso(),
      },
      { suppressed: this.suppression.all(), queued: new Set() },
    );
    this.campaignId = this.created.campaign.id;
    void this.campaigns.save(this.created.campaign);

    this.runner = new CampaignRunner({
      campaigns: this.campaigns,
      accounts: this.accounts,
      suppression: this.suppression,
      gmail: this.gmail,
      clock: () => new Date(this.now),
      delay: async (milliseconds) => {
        this.now += milliseconds;
        await pace(milliseconds);
      },
      random: seededRandom(options.seed ?? DEFAULT_SEED),
    });
  }

  campaign(): Campaign {
    const campaign = this.campaigns.peek(this.campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    return campaign;
  }

  /** The personalised test message: the first recipient, as /test-send renders it. */
  preview(): { to: string; subject: string; body: string } {
    const campaign = this.campaign();
    const recipient = campaign.recipients.find((item) => item.accountId === this.account.id)
      ?? campaign.recipients[0];
    return {
      to: this.account.email,
      subject: renderMessage(campaign.subject, recipient),
      body: renderMessage(campaign.body, recipient),
    };
  }

  iso(): string {
    return new Date(this.now).toISOString();
  }
}

export function accountFor(rules: Rules): Account {
  return {
    id: "demo-account",
    email: senderEmail,
    label: senderEmail,
    capabilities: ["send"],
    dailyCap: rules.dailyCap,
    delayMinSeconds: rules.delayMinSeconds,
    delayMaxSeconds: rules.delayMaxSeconds,
    timeZone: "UTC",
    sendingWindow: { days: [...rules.days], start: rules.start, end: rules.end },
    credentialDirectory: "",
  };
}

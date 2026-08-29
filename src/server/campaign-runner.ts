import { localDay, renderMessage, sentToday } from "../domain/campaigns";
import type { Account, Campaign } from "../domain/types";
import type { GmailAccountAdapter, SendResult } from "../gmail/adapter";

export interface CampaignRepository {
  get(id: string): Promise<Campaign | null>;
  list(): Promise<Campaign[]>;
  save(campaign: Campaign): Promise<void>;
  update(id: string, update: (campaign: Campaign) => Campaign): Promise<Campaign | null>;
}

export interface AccountRepository {
  get(id: string): Promise<Account | null>;
}

export interface SuppressionRepository {
  has(email: string): Promise<boolean>;
}

interface CampaignRunnerDependencies {
  campaigns: CampaignRepository;
  accounts: AccountRepository;
  suppression: SuppressionRepository;
  gmail: GmailAccountAdapter;
  clock?: () => Date;
  delay?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

export class CampaignRunner {
  private readonly activeCampaigns = new Set<string>();
  private readonly accountTails = new Map<string, Promise<void>>();
  private readonly clock: () => Date;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly dependencies: CampaignRunnerDependencies) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.delay = dependencies.delay ?? wait;
    this.random = dependencies.random ?? Math.random;
  }

  async run(campaignId: string): Promise<void> {
    if (this.activeCampaigns.has(campaignId)) return;
    this.activeCampaigns.add(campaignId);
    try {
      await this.runCampaign(campaignId);
    } finally {
      this.activeCampaigns.delete(campaignId);
    }
  }

  private async runCampaign(campaignId: string): Promise<void> {
    while (true) {
      const campaign = await this.dependencies.campaigns.get(campaignId);
      if (!campaign) throw new Error("Campaign not found.");
      if (campaign.status !== "running") return;

      const recipient = campaign.recipients.find((item) => item.status === "pending");
      if (!recipient) {
        await this.dependencies.campaigns.update(campaignId, (latest) => ({
          ...latest,
          status: latest.status === "running" ? "done" : latest.status,
        }));
        return;
      }

      const account = await this.dependencies.accounts.get(recipient.accountId);
      if (!account) {
        await this.dependencies.campaigns.update(campaignId, (latest) => {
          const target = findRecipient(latest, recipient.email);
          if (target) target.error = "This Gmail account is unavailable.";
          latest.status = "paused";
          return latest;
        });
        return;
      }

      const outcome = await this.withAccountLock(account.id, () =>
        this.processRecipient(campaignId, recipient.email, account),
      );
      if (!outcome.continue) return;
      if (outcome.campaign) {
        const seconds = delaySeconds(outcome.campaign, account, this.random());
        await this.delay(seconds * 1_000);
      }
    }
  }

  private async processRecipient(
    campaignId: string,
    email: string,
    account: Account,
  ): Promise<{ continue: boolean; campaign?: Campaign }> {
    const current = await this.dependencies.campaigns.get(campaignId);
    const currentRecipient = current ? findRecipient(current, email) : undefined;
    if (!current || current.status !== "running") return { continue: false };
    if (currentRecipient?.status !== "pending") return { continue: true };

    const now = this.clock();
    if (!(await this.canSend(current, account, now))) {
      await this.dependencies.campaigns.update(campaignId, (latest) => ({
        ...latest,
        status: "paused",
      }));
      return { continue: false };
    }

    if (await this.dependencies.suppression.has(email)) {
      await this.skipSuppressed(campaignId, email);
      return { continue: true };
    }

    const claimed = await this.dependencies.campaigns.update(campaignId, (latest) => {
      if (latest.status !== "running") return latest;
      const target = findRecipient(latest, email);
      if (target?.status === "pending") {
        target.status = "sending";
        delete target.error;
      }
      return latest;
    });
    const claimedRecipient = claimed ? findRecipient(claimed, email) : null;
    if (!claimed || claimed.status !== "running" || claimedRecipient?.status !== "sending") {
      return { continue: false };
    }

    if (await this.dependencies.suppression.has(email)) {
      await this.skipSuppressed(campaignId, email);
      return { continue: true };
    }

    const finalSafetyError = await this.finalSafetyError(campaignId, email);
    if (finalSafetyError) {
      await this.skipRecipient(campaignId, email, finalSafetyError);
      return { continue: true };
    }

    let result: SendResult;
    try {
      result = await this.dependencies.gmail.send(account, {
        to: claimedRecipient.email,
        subject: renderMessage(claimed.subject, claimedRecipient),
        body: renderMessage(claimed.body, claimedRecipient),
      });
    } catch {
      await this.dependencies.campaigns.update(campaignId, (latest) => {
        const target = findRecipient(latest, email);
        if (target) {
          target.status = "failed";
          target.failedAt = now.toISOString();
          target.error = "Delivery result is unknown. Check Gmail Sent before retrying.";
        }
        latest.status = "paused";
        return latest;
      });
      return { continue: false };
    }

    const shouldContinue = await this.applyResult(campaignId, email, result, now);
    return shouldContinue ? { continue: true, campaign: claimed } : { continue: false };
  }

  private async canSend(campaign: Campaign, account: Account, now: Date): Promise<boolean> {
    if (!isWithinSendingWindow(account, now)) return false;
    const campaigns = await this.dependencies.campaigns.list();
    const cap = Math.min(campaign.dailyCap, account.dailyCap);
    return sentToday(campaigns, account.id, localDay(now, account.timeZone), account.timeZone) < cap;
  }

  private async applyResult(
    campaignId: string,
    email: string,
    result: SendResult,
    now: Date,
  ): Promise<boolean> {
    await this.dependencies.campaigns.update(campaignId, (campaign) => {
      const recipient = findRecipient(campaign, email);
      if (!recipient) return campaign;
      if (result.ok) {
        recipient.status = "sent";
        recipient.messageId = result.messageId;
        recipient.sentAt = now.toISOString();
        return campaign;
      }

      recipient.error = result.message;
      if (result.kind === "permanent") {
        recipient.status = "failed";
        recipient.failedAt = now.toISOString();
        return campaign;
      }

      recipient.status = "pending";
      campaign.status = "paused";
      return campaign;
    });
    return result.ok || result.kind === "permanent";
  }

  private async skipSuppressed(campaignId: string, email: string): Promise<void> {
    await this.skipRecipient(campaignId, email, "Added to do-not-contact before send.");
  }

  private async skipRecipient(campaignId: string, email: string, error: string): Promise<void> {
    await this.dependencies.campaigns.update(campaignId, (campaign) => {
      const recipient = findRecipient(campaign, email);
      if (recipient) {
        recipient.status = "skipped";
        recipient.error = error;
      }
      return campaign;
    });
  }

  private async finalSafetyError(campaignId: string, email: string): Promise<string | null> {
    const campaigns = await this.dependencies.campaigns.list();
    const others = campaigns.filter((campaign) => campaign.id !== campaignId);
    const matching = others.flatMap((campaign) =>
      campaign.recipients
        .filter((recipient) => recipient.email === email)
        .map((recipient) => ({ campaignId: campaign.id, recipient })),
    );
    if (matching.some(({ recipient }) => recipient.bouncedAt)) return "Bounced before send.";
    if (matching.some(({ recipient }) => recipient.status === "sent")) {
      return "Already contacted by another campaign.";
    }
    if (
      matching.some(
        ({ campaignId: otherId, recipient }) => recipient.status === "sending" && otherId < campaignId,
      )
    ) {
      return "Already being sent by another campaign.";
    }
    return null;
  }

  private async withAccountLock<T>(accountId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.accountTails.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.accountTails.set(accountId, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.accountTails.get(accountId) === current) this.accountTails.delete(accountId);
    }
  }
}

function findRecipient(campaign: Campaign, email: string): Campaign["recipients"][number] | undefined {
  return campaign.recipients.find((recipient) => recipient.email === email);
}

function delaySeconds(campaign: Campaign, account: Account, random: number): number {
  const minimum = Math.max(campaign.delayMinSeconds, account.delayMinSeconds);
  const configuredMaximum = Math.min(campaign.delayMaxSeconds, account.delayMaxSeconds);
  const maximum = Math.max(minimum, configuredMaximum);
  return minimum + Math.floor(random * (maximum - minimum + 1));
}

function isWithinSendingWindow(account: Account, date: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: account.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = weekdays[values.weekday];
  const time = `${values.hour}:${values.minute}`;
  return (
    account.sendingWindow.days.includes(day) &&
    time >= account.sendingWindow.start &&
    time <= account.sendingWindow.end
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

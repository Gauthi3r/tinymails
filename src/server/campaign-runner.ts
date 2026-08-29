import { renderMessage, sentToday } from "../domain/campaigns";
import type { Account, Campaign } from "../domain/types";
import type { GmailAccountAdapter, SendResult } from "../gmail/adapter";

export interface CampaignRepository {
  get(id: string): Promise<Campaign | null>;
  list(): Promise<Campaign[]>;
  save(campaign: Campaign): Promise<void>;
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
}

export class CampaignRunner {
  private readonly clock: () => Date;
  private readonly delay: (milliseconds: number) => Promise<void>;

  constructor(private readonly dependencies: CampaignRunnerDependencies) {
    this.clock = dependencies.clock ?? (() => new Date());
    this.delay = dependencies.delay ?? wait;
  }

  async run(campaignId: string): Promise<void> {
    const campaign = await this.dependencies.campaigns.get(campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    if (campaign.status !== "running") return;

    for (const recipient of campaign.recipients) {
      if (campaign.status !== "running" || recipient.status !== "pending") continue;

      const account = await this.dependencies.accounts.get(recipient.accountId);
      if (!account) {
        recipient.error = "This Gmail account is unavailable.";
        campaign.status = "paused";
        await this.dependencies.campaigns.save(campaign);
        return;
      }

      const now = this.clock();
      if (!(await this.canSend(campaign, account, now))) {
        campaign.status = "paused";
        await this.dependencies.campaigns.save(campaign);
        return;
      }

      if (await this.dependencies.suppression.has(recipient.email)) {
        recipient.status = "skipped";
        recipient.error = "Added to do-not-contact before send.";
        await this.dependencies.campaigns.save(campaign);
        continue;
      }

      recipient.status = "sending";
      delete recipient.error;
      await this.dependencies.campaigns.save(campaign);

      const result = await this.dependencies.gmail.send(account, {
        to: recipient.email,
        subject: renderMessage(campaign.subject, recipient),
        body: renderMessage(campaign.body, recipient),
      });
      const shouldContinue = await this.applyResult(campaign, recipient, result, now);
      if (!shouldContinue) return;

      const seconds = Math.max(campaign.delayMinSeconds, account.delayMinSeconds);
      await this.delay(seconds * 1_000);
    }

    if (campaign.recipients.every((recipient) => recipient.status !== "pending" && recipient.status !== "sending")) {
      campaign.status = "done";
      await this.dependencies.campaigns.save(campaign);
    }
  }

  private async canSend(campaign: Campaign, account: Account, now: Date): Promise<boolean> {
    if (!isWithinSendingWindow(account, now)) return false;
    const campaigns = await this.dependencies.campaigns.list();
    const cap = Math.min(campaign.dailyCap, account.dailyCap);
    return sentToday(campaigns, account.id, now.toISOString().slice(0, 10)) < cap;
  }

  private async applyResult(
    campaign: Campaign,
    recipient: Campaign["recipients"][number],
    result: SendResult,
    now: Date,
  ): Promise<boolean> {
    if (result.ok) {
      recipient.status = "sent";
      recipient.messageId = result.messageId;
      recipient.sentAt = now.toISOString();
      await this.dependencies.campaigns.save(campaign);
      return true;
    }

    recipient.error = result.message;
    if (result.kind === "permanent") {
      recipient.status = "failed";
      recipient.failedAt = now.toISOString();
      await this.dependencies.campaigns.save(campaign);
      return true;
    }

    recipient.status = "pending";
    campaign.status = "paused";
    await this.dependencies.campaigns.save(campaign);
    return false;
  }
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

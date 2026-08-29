import { randomUUID } from "node:crypto";
import { normalizeEmail } from "./email";
import type { Campaign, ContactInput } from "./types";

export interface CreateCampaignInput {
  name: string;
  subject: string;
  body: string;
  accountIds: string[];
  dailyCap: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  recipients: ContactInput[];
  now: string;
}

export interface CampaignBlocks {
  suppressed: Set<string>;
  bounced: Set<string>;
  queued: Set<string>;
}

export type ExclusionReason = "invalid" | "duplicate" | "do-not-contact" | "bounced" | "queued";

export interface CampaignExclusion {
  email: string;
  reason: ExclusionReason;
}

export interface CreateCampaignResult {
  campaign: Campaign;
  excluded: CampaignExclusion[];
}

export function createCampaign(
  input: CreateCampaignInput,
  blocks: CampaignBlocks,
): CreateCampaignResult {
  if (input.accountIds.length === 0) throw new Error("Choose at least one Gmail account.");

  const excluded: CampaignExclusion[] = [];
  const seen = new Set<string>();
  const recipients: Campaign["recipients"] = [];

  for (const contact of input.recipients) {
    const email = normalizeEmail(contact.email);
    if (!email) {
      excluded.push({ email: contact.email, reason: "invalid" });
      continue;
    }
    if (seen.has(email)) {
      excluded.push({ email, reason: "duplicate" });
      continue;
    }
    seen.add(email);

    const reason = blockedReason(email, blocks);
    if (reason) {
      excluded.push({ email, reason });
      continue;
    }

    recipients.push({
      email,
      accountId: input.accountIds[recipients.length % input.accountIds.length],
      status: "pending",
      ...(contact.firstName?.trim() ? { firstName: contact.firstName.trim() } : {}),
      ...(contact.company?.trim() ? { company: contact.company.trim() } : {}),
    });
  }

  return {
    campaign: {
      id: randomUUID(),
      name: input.name.trim(),
      subject: input.subject,
      body: input.body,
      accountIds: [...input.accountIds],
      dailyCap: input.dailyCap,
      delayMinSeconds: input.delayMinSeconds,
      delayMaxSeconds: input.delayMaxSeconds,
      createdAt: input.now,
      status: "paused",
      recipients,
    },
    excluded,
  };
}

function blockedReason(email: string, blocks: CampaignBlocks): ExclusionReason | null {
  if (blocks.suppressed.has(email)) return "do-not-contact";
  if (blocks.bounced.has(email)) return "bounced";
  if (blocks.queued.has(email)) return "queued";
  return null;
}

export function renderMessage(template: string, contact: ContactInput): string {
  return template
    .replaceAll("{firstName}", contact.firstName?.trim() || "there")
    .replaceAll("{company}", contact.company?.trim() || "your company");
}

export function sentToday(campaigns: Campaign[], accountId: string, day: string): number {
  return campaigns.reduce(
    (total, campaign) =>
      total +
      campaign.recipients.filter(
        (recipient) =>
          recipient.accountId === accountId &&
          recipient.status === "sent" &&
          recipient.sentAt?.slice(0, 10) === day,
      ).length,
    0,
  );
}

export function recoverInterruptedCampaigns(campaigns: Campaign[]): Campaign[] {
  return campaigns.map((campaign) => {
    if (campaign.status !== "running") return structuredClone(campaign);
    return {
      ...campaign,
      status: "paused",
      recipients: campaign.recipients.map((recipient) =>
        recipient.status === "sending" ? { ...recipient, status: "pending" } : { ...recipient },
      ),
    };
  });
}

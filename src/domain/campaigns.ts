import { randomUUID } from "node:crypto";
import { normalizeEmail } from "./email";
import { localDay } from "./schedule";
export { renderMessage } from "./personalization";
export { localDay } from "./schedule";
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
  queued: Set<string>;
}

export type ExclusionReason = "invalid" | "duplicate" | "do-not-contact" | "queued";

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

  if (recipients.length === 0) throw new Error("No eligible recipients remain after safety checks.");

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
  if (blocks.queued.has(email)) return "queued";
  return null;
}

export function sentToday(
  campaigns: Campaign[],
  accountId: string,
  day: string,
  timeZone = "UTC",
): number {
  return campaigns.reduce(
    (total, campaign) =>
      total +
      campaign.recipients.filter(
        (recipient) =>
          recipient.accountId === accountId &&
          recipient.status === "sent" &&
          recipient.sentAt !== undefined && localDay(new Date(recipient.sentAt), timeZone) === day,
      ).length,
    0,
  );
}

export const RESTART_PAUSE_REASON = "TinyMails was restarted. Press Start to continue.";
export const UNKNOWN_DELIVERY_REASON = "Delivery result is unknown. Check Gmail Sent before retrying.";

/**
 * Applied once at startup. A campaign that was running comes back paused, so
 * opening TinyMails never sends by surprise, and a delivery that was in flight
 * is marked failed so it cannot go out twice.
 */
export function recoverInterruptedCampaigns(campaigns: Campaign[]): Campaign[] {
  return campaigns.map((campaign) => {
    const interrupted = campaign.recipients.some((recipient) => recipient.status === "sending");
    const recipients = campaign.recipients.map((recipient): Campaign["recipients"][number] =>
      recipient.status === "sending"
        ? { ...recipient, status: "failed", error: UNKNOWN_DELIVERY_REASON }
        : { ...recipient },
    );
    if (campaign.status !== "running") return { ...campaign, recipients };
    return {
      ...withoutWait(campaign),
      status: "paused",
      pauseReason: interrupted ? UNKNOWN_DELIVERY_REASON : RESTART_PAUSE_REASON,
      recipients,
    };
  });
}

/** A copy of the campaign with its waiting note removed: it is sending again, or no longer running. */
export function withoutWait(campaign: Campaign): Campaign {
  const { waitingReason: _waitingReason, resumesAt: _resumesAt, ...rest } = campaign;
  return rest;
}

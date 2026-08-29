import { normalizeEmail } from "./email";
import type { Campaign, ContactInput, Lead, LeadStatus } from "./types";

export interface MergeLeadsResult {
  leads: Lead[];
  added: number;
  existing: number;
  enriched: number;
  duplicate: number;
  invalid: number;
}

export function mergeLeads(
  existing: Lead[],
  incoming: ContactInput[],
  source: string,
  now: string,
): MergeLeadsResult {
  const leads = existing.map((lead) => ({
    ...lead,
    email: normalizeEmail(lead.email) ?? lead.email,
  }));
  const byEmail = new Map(leads.map((lead) => [lead.email, lead]));
  const incomingSeen = new Set<string>();
  const result: MergeLeadsResult = {
    leads,
    added: 0,
    existing: 0,
    enriched: 0,
    duplicate: 0,
    invalid: 0,
  };

  for (const contact of incoming) {
    const email = normalizeEmail(contact.email);
    if (!email) {
      result.invalid += 1;
      continue;
    }
    if (incomingSeen.has(email)) {
      result.duplicate += 1;
      continue;
    }
    incomingSeen.add(email);

    const known = byEmail.get(email);
    if (known) {
      result.existing += 1;
      let enriched = false;
      if (!known.firstName && contact.firstName?.trim()) {
        known.firstName = contact.firstName.trim();
        enriched = true;
      }
      if (!known.company && contact.company?.trim()) {
        known.company = contact.company.trim();
        enriched = true;
      }
      if (enriched) result.enriched += 1;
      continue;
    }

    const lead: Lead = {
      email,
      source,
      addedAt: now,
      ...(contact.firstName?.trim() ? { firstName: contact.firstName.trim() } : {}),
      ...(contact.company?.trim() ? { company: contact.company.trim() } : {}),
    };
    leads.push(lead);
    byEmail.set(email, lead);
    result.added += 1;
  }

  return result;
}

export function deriveLeadStatus(
  lead: Lead,
  campaigns: Campaign[],
  suppressed: Set<string>,
): LeadStatus {
  const email = normalizeEmail(lead.email) ?? lead.email;
  const recipients = campaigns.flatMap((campaign) =>
    campaign.recipients
      .filter((recipient) => recipient.email === email)
      .map((recipient) => ({ campaign, recipient })),
  );

  if (suppressed.has(email)) return "do-not-contact";
  if (recipients.some(({ recipient }) => Boolean(recipient.bouncedAt))) return "bounced";
  if (recipients.some(({ recipient }) => Boolean(recipient.repliedAt))) return "replied";
  if (recipients.some(({ recipient }) => recipient.status === "sent")) return "contacted";
  if (
    recipients.some(
      ({ campaign, recipient }) =>
        (campaign.status === "running" || campaign.status === "paused") &&
        (recipient.status === "pending" || recipient.status === "sending"),
    )
  ) {
    return "queued";
  }
  return "new";
}

export function availableLeads(
  leads: Lead[],
  campaigns: Campaign[],
  suppressed: Set<string>,
  source?: string,
): Lead[] {
  return leads.filter(
    (lead) =>
      (!source || lead.source === source) && deriveLeadStatus(lead, campaigns, suppressed) === "new",
  );
}

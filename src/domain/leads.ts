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
  listId: string,
  now: string,
): MergeLeadsResult {
  const leads = existing.map((lead) => ({
    ...lead,
    email: normalizeEmail(lead.email) ?? lead.email,
    listIds: [...new Set(lead.listIds)],
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
      if (!known.listIds.includes(listId)) known.listIds.push(listId);
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
      listIds: [listId],
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
  return indexLeadStatuses(campaigns, suppressed).get(email) ?? "new";
}

export function indexLeadStatuses(
  campaigns: Campaign[],
  suppressed: Set<string>,
): Map<string, LeadStatus> {
  const statuses = new Map<string, LeadStatus>();
  for (const address of suppressed) {
    const email = normalizeEmail(address);
    if (email) statuses.set(email, "do-not-contact");
  }
  for (const campaign of campaigns) {
    const active = campaign.status === "running" || campaign.status === "paused";
    for (const recipient of campaign.recipients) {
      const email = normalizeEmail(recipient.email) ?? recipient.email;
      const current = statuses.get(email);
      if (current === "do-not-contact") continue;
      if (recipient.status === "sent") {
        statuses.set(email, "contacted");
      } else if (
        current !== "contacted"
        && active
        && (recipient.status === "pending" || recipient.status === "sending")
      ) {
        statuses.set(email, "queued");
      }
    }
  }
  return statuses;
}

export function availableLeads(
  leads: Lead[],
  campaigns: Campaign[],
  suppressed: Set<string>,
  listId?: string,
): Lead[] {
  const statuses = indexLeadStatuses(campaigns, suppressed);
  return leads.filter(
    (lead) =>
      (!listId || lead.listIds.includes(listId))
      && (statuses.get(normalizeEmail(lead.email) ?? lead.email) ?? "new") === "new",
  );
}

import express, { type NextFunction, type Request, type Response } from "express";
import { createCampaign } from "../domain/campaigns";
import { deriveLeadStatus, mergeLeads } from "../domain/leads";
import type { Account, ContactInput } from "../domain/types";
import type { GmailAccountAdapter } from "../gmail/adapter";
import { CampaignRunner } from "./campaign-runner";
import type { Repositories } from "./repositories";

export interface AppDependencies {
  repositories: Repositories;
  gmail: GmailAccountAdapter;
  dataDir: string;
  clock?: () => Date;
}

class PublicError extends Error {}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const clock = dependencies.clock ?? (() => new Date());
  const runner = new CampaignRunner({
    campaigns: dependencies.repositories.campaigns,
    accounts: dependencies.repositories.accounts,
    suppression: dependencies.repositories.suppression,
    gmail: dependencies.gmail,
    clock,
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, product: "TinyMails", version: "0.1.0" });
  });

  app.get("/api/accounts", asyncRoute(async (_request, response) => {
    const accounts = (await dependencies.repositories.accounts.list()).map(publicAccount);
    response.json({ accounts });
  }));

  app.get("/api/leads", asyncRoute(async (_request, response) => {
    const [leads, campaigns, suppressed] = await Promise.all([
      dependencies.repositories.leads.list(),
      dependencies.repositories.campaigns.list(),
      dependencies.repositories.suppression.list(),
    ]);
    const suppression = new Set(suppressed);
    const decorated = leads.map((lead) => ({
      ...lead,
      status: deriveLeadStatus(lead, campaigns, suppression),
    }));
    const counts: Record<string, number> = { total: decorated.length };
    for (const lead of decorated) counts[lead.status] = (counts[lead.status] ?? 0) + 1;
    response.json({
      leads: decorated,
      counts,
      sources: [...new Set(leads.map((lead) => lead.source))].sort(),
    });
  }));

  app.post("/api/leads/import", asyncRoute(async (request, response) => {
    const body = objectBody(request.body);
    if (!Array.isArray(body.leads)) throw new PublicError("Leads must be an array.");
    if (typeof body.source !== "string" || !body.source.trim()) {
      throw new PublicError("A source name is required.");
    }
    const source = body.source.trim();
    const incoming = body.leads.filter(isContactInput);
    if (incoming.length !== body.leads.length) throw new PublicError("Every lead needs an email address.");
    let result: ReturnType<typeof mergeLeads> | null = null;
    await dependencies.repositories.leads.update((leads) => {
      result = mergeLeads(leads, incoming, source, clock().toISOString());
      return result.leads;
    });
    response.json(result);
  }));

  app.get("/api/campaigns", asyncRoute(async (_request, response) => {
    response.json({ campaigns: await dependencies.repositories.campaigns.list() });
  }));

  app.post("/api/campaigns", asyncRoute(async (request, response) => {
    const input = campaignInput(objectBody(request.body), clock().toISOString());
    const campaigns = await dependencies.repositories.campaigns.list();
    const suppressed = new Set(await dependencies.repositories.suppression.list());
    const bounced = new Set(
      campaigns.flatMap((campaign) =>
        campaign.recipients.filter((recipient) => recipient.bouncedAt).map((recipient) => recipient.email),
      ),
    );
    const queued = new Set(
      campaigns.flatMap((campaign) =>
        campaign.status === "running" || campaign.status === "paused"
          ? campaign.recipients
              .filter((recipient) => recipient.status === "pending" || recipient.status === "sending")
              .map((recipient) => recipient.email)
          : [],
      ),
    );
    const result = createCampaign(input, { suppressed, bounced, queued });
    await dependencies.repositories.campaigns.save(result.campaign);
    response.status(201).json(result);
  }));

  app.post("/api/campaigns/:id/start", asyncRoute(async (request, response) => {
    const campaign = await dependencies.repositories.campaigns.update(
      firstParam(request.params.id),
      (record) => ({ ...record, status: "running" }),
    );
    if (!campaign) {
      response.status(404).json({ error: "Campaign not found." });
      return;
    }
    setImmediate(() => {
      void runner.run(campaign.id).catch((error: unknown) => {
        console.error("TinyMails campaign runner failed", error);
      });
    });
    response.status(202).json({ campaign });
  }));

  app.post("/api/campaigns/:id/pause", asyncRoute(async (request, response) => {
    const campaign = await dependencies.repositories.campaigns.update(
      firstParam(request.params.id),
      (record) => ({ ...record, status: "paused" }),
    );
    if (!campaign) {
      response.status(404).json({ error: "Campaign not found." });
      return;
    }
    response.json({ campaign });
  }));

  app.get("/api/templates", asyncRoute(async (_request, response) => {
    response.json({ templates: await dependencies.repositories.templates.list() });
  }));

  app.get("/api/replies", asyncRoute(async (_request, response) => {
    response.json({ replies: await dependencies.repositories.replies.list() });
  }));

  app.get("/api/suppression", asyncRoute(async (_request, response) => {
    response.json({ emails: await dependencies.repositories.suppression.list() });
  }));

  app.post("/api/suppression", asyncRoute(async (request, response) => {
    const body = objectBody(request.body);
    if (!Array.isArray(body.emails) || !body.emails.every((email) => typeof email === "string")) {
      throw new PublicError("Emails must be an array of addresses.");
    }
    response.json({ emails: await dependencies.repositories.suppression.add(body.emails) });
  }));

  app.get("/api/settings", asyncRoute(async (_request, response) => {
    response.json({
      accounts: (await dependencies.repositories.accounts.list()).map(publicAccount),
      dataDir: dependencies.dataDir,
      version: "0.1.0",
      suppressionCount: (await dependencies.repositories.suppression.list()).length,
    });
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof PublicError) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error("TinyMails request failed", error);
    response.status(500).json({ error: "The local request could not be completed." });
  });

  return app;
}

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): (request: Request, response: Response, next: NextFunction) => void {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicError("Invalid request body.");
  return value as Record<string, unknown>;
}

function isContactInput(value: unknown): value is ContactInput {
  return Boolean(value && typeof value === "object" && typeof (value as { email?: unknown }).email === "string");
}

function campaignInput(body: Record<string, unknown>, now: string) {
  const requiredStrings = ["name", "subject", "body"] as const;
  for (const field of requiredStrings) {
    if (typeof body[field] !== "string" || !body[field].trim()) {
      throw new PublicError(`Campaign ${field} is required.`);
    }
  }
  if (!Array.isArray(body.accountIds) || !body.accountIds.every((id) => typeof id === "string")) {
    throw new PublicError("Choose at least one Gmail account.");
  }
  if (!Array.isArray(body.recipients) || !body.recipients.every(isContactInput)) {
    throw new PublicError("Recipients must be an array of contacts.");
  }

  return {
    name: body.name as string,
    subject: body.subject as string,
    body: body.body as string,
    accountIds: body.accountIds,
    dailyCap: positiveNumber(body.dailyCap, "daily cap"),
    delayMinSeconds: nonNegativeNumber(body.delayMinSeconds, "minimum delay"),
    delayMaxSeconds: nonNegativeNumber(body.delayMaxSeconds, "maximum delay"),
    recipients: body.recipients,
    now,
  };
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new PublicError(`Campaign ${label} must be greater than zero.`);
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PublicError(`Campaign ${label} cannot be negative.`);
  }
  return value;
}

function publicAccount(account: Account) {
  const { credentialDirectory: _credentialDirectory, ...safe } = account;
  return safe;
}

function firstParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

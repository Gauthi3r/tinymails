import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { createCampaign, renderMessage } from "../domain/campaigns";
import { deriveLeadStatus, mergeLeads } from "../domain/leads";
import type { Account, ContactInput } from "../domain/types";
import type { GmailAccountAdapter } from "../gmail/adapter";
import {
  GoogleOAuthFlowError,
  type GoogleOAuthStatus,
} from "../gmail/google-oauth";
import { OAuthClientValidationError } from "../gmail/oauth-client";
import { CampaignRunner } from "./campaign-runner";
import type { Repositories } from "./repositories";

export interface GoogleOAuthCoordinator {
  start(clientJson: unknown, redirectUri: string): Promise<{ sessionId: string; authorizationUrl: string }>;
  finish(oauthState: string, code: string): Promise<{ accountId: string }>;
  status(sessionId: string): GoogleOAuthStatus;
}

export interface AppDependencies {
  repositories: Repositories;
  gmail: GmailAccountAdapter;
  dataDir: string;
  oauth?: GoogleOAuthCoordinator;
  oauthRedirectUri?: string;
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
  app.use(localRequestGuard);
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, product: "TinyMails", version: "0.1.0" });
  });

  app.get("/api/accounts", asyncRoute(async (_request, response) => {
    const accounts = (await dependencies.repositories.accounts.list()).map(publicAccount);
    response.json({ accounts });
  }));

  app.post("/api/oauth/google/start", asyncRoute(async (request, response) => {
    const oauth = requireOAuth(dependencies);
    const body = objectBody(request.body);
    if (!("client" in body)) throw new PublicError("Choose a Google OAuth client JSON file.");
    try {
      response.json(await oauth.start(body.client, dependencies.oauthRedirectUri as string));
    } catch (error) {
      if (error instanceof OAuthClientValidationError) throw new PublicError(error.message);
      throw error;
    }
  }));

  app.get("/api/oauth/google/callback", asyncRoute(async (request, response) => {
    const oauth = requireOAuth(dependencies);
    const state = singleQuery(request.query.state);
    const code = singleQuery(request.query.code);
    if (!state || !code) {
      sendOAuthResult(response, false, 400);
      return;
    }
    try {
      await oauth.finish(state, code);
      sendOAuthResult(response, true, 200);
    } catch (error) {
      if (error instanceof GoogleOAuthFlowError) {
        sendOAuthResult(response, false, 400);
        return;
      }
      throw error;
    }
  }));

  app.get("/api/oauth/google/sessions/:id", asyncRoute(async (request, response) => {
    const oauth = requireOAuth(dependencies);
    response.json(oauth.status(firstParam(request.params.id)));
  }));

  app.post("/api/accounts/:id/test-send", asyncRoute(async (request, response) => {
    const account = await dependencies.repositories.accounts.get(firstParam(request.params.id));
    if (!account) {
      response.status(404).json({ error: "Gmail account not found." });
      return;
    }
    const result = await dependencies.gmail.send(account, {
      to: account.email,
      subject: "TinyMails is connected",
      body: "Your Gmail connection is ready. You can now send a careful test campaign from TinyMails.",
    });
    if (result.ok) {
      await dependencies.repositories.accounts.update(account.id, (record) => ({
        ...record,
        lastTestedAt: clock().toISOString(),
      }));
      response.json(result);
      return;
    }
    const status = result.kind === "temporary" ? 503 : result.kind === "auth" ? 409 : 400;
    response.status(status).json({ error: result.message });
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
    const accounts = await dependencies.repositories.accounts.list();
    const connectedAccountIds = new Set(accounts.map((account) => account.id));
    if (!input.accountIds.every((id) => connectedAccountIds.has(id))) {
      throw new PublicError("Choose only connected Gmail accounts.");
    }
    const suppressed = new Set(await dependencies.repositories.suppression.list());
    let result: ReturnType<typeof createCampaign>;
    try {
      result = await dependencies.repositories.campaigns.createFromSnapshot((campaigns) => {
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
        const created = createCampaign(input, { suppressed, bounced, queued });
        return { record: created.campaign, result: created };
      });
    } catch (error) {
      if (error instanceof Error) throw new PublicError(error.message);
      throw error;
    }
    response.status(201).json(result);
  }));

  app.post("/api/campaigns/:id/start", asyncRoute(async (request, response) => {
    const campaignId = firstParam(request.params.id);
    const existing = await dependencies.repositories.campaigns.get(campaignId);
    if (!existing) {
      response.status(404).json({ error: "Campaign not found." });
      return;
    }
    const assignedAccounts = await Promise.all(existing.accountIds.map((id) => dependencies.repositories.accounts.get(id)));
    if (assignedAccounts.some((account) => !account?.lastTestedAt)) {
      response.status(409).json({
        error: "Send a test email from every assigned Gmail account before starting.",
      });
      return;
    }
    if (!existing.testedAt) {
      response.status(409).json({
        error: "Send this campaign's personalized preview before starting.",
      });
      return;
    }
    const campaign = await dependencies.repositories.campaigns.update(
      campaignId,
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

  app.post("/api/campaigns/:id/test-send", asyncRoute(async (request, response) => {
    const campaignId = firstParam(request.params.id);
    const campaign = await dependencies.repositories.campaigns.get(campaignId);
    if (!campaign) {
      response.status(404).json({ error: "Campaign not found." });
      return;
    }
    if (campaign.status !== "paused") {
      response.status(409).json({ error: "Only a paused campaign can send a preview." });
      return;
    }

    const accounts = await Promise.all(
      campaign.accountIds.map((id) => dependencies.repositories.accounts.get(id)),
    );
    if (accounts.some((account) => !account)) {
      response.status(409).json({ error: "Reconnect every assigned Gmail account before testing." });
      return;
    }

    for (const account of accounts) {
      if (!account) continue;
      const recipient = campaign.recipients.find((item) => item.accountId === account.id)
        ?? campaign.recipients[0];
      if (!recipient) throw new PublicError("This campaign has no recipient to preview.");
      let result;
      try {
        result = await dependencies.gmail.send(account, {
          to: account.email,
          subject: renderMessage(campaign.subject, recipient),
          body: renderMessage(campaign.body, recipient),
        });
      } catch {
        response.status(503).json({ error: "The campaign preview could not be confirmed." });
        return;
      }
      if (!result.ok) {
        const status = result.kind === "temporary" ? 503 : result.kind === "auth" ? 409 : 400;
        response.status(status).json({ error: result.message });
        return;
      }
    }

    const testedAt = clock().toISOString();
    await Promise.all(
      accounts.map((account) => account
        ? dependencies.repositories.accounts.update(account.id, (record) => ({ ...record, lastTestedAt: testedAt }))
        : null),
    );
    const testedCampaign = await dependencies.repositories.campaigns.update(campaignId, (record) => ({
      ...record,
      testedAt,
    }));
    response.json({ campaign: testedCampaign });
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

  app.post("/api/templates", asyncRoute(async (request, response) => {
    const body = objectBody(request.body);
    const name = requiredString(body.name, "Template name is required.");
    const subject = requiredString(body.subject, "Template subject is required.");
    const templateBody = requiredString(body.body, "Template message is required.");
    const template = {
      id: randomUUID(),
      name,
      subject,
      body: templateBody,
      updatedAt: clock().toISOString(),
    };
    await dependencies.repositories.templates.save(template);
    response.status(201).json({ template });
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

  app.get("/api/backup", asyncRoute(async (_request, response) => {
    const [accounts, campaigns, leads, templates, replies, suppression] = await Promise.all([
      dependencies.repositories.accounts.list(),
      dependencies.repositories.campaigns.list(),
      dependencies.repositories.leads.list(),
      dependencies.repositories.templates.list(),
      dependencies.repositories.replies.list(),
      dependencies.repositories.suppression.list(),
    ]);
    const exportedAt = clock().toISOString();
    response
      .set("Content-Disposition", `attachment; filename="tinymails-backup-${exportedAt.slice(0, 10)}.json"`)
      .json({
        product: "TinyMails",
        version: "0.1.0",
        exportedAt,
        credentialsIncluded: false,
        data: {
          accounts: accounts.map(publicAccount),
          campaigns,
          leads,
          templates,
          replies,
          suppression,
        },
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

function localRequestGuard(request: Request, response: Response, next: NextFunction): void {
  const host = request.get("host")?.toLowerCase();
  if (!host || !isLoopbackHost(host)) {
    response.status(403).json({ error: "TinyMails only accepts requests from its local address." });
    return;
  }

  const origin = request.get("origin");
  if (origin && isStateChangingMethod(request.method) && !isSameLoopbackOrigin(origin, host)) {
    response.status(403).json({ error: "TinyMails rejected a request from another website." });
    return;
  }
  next();
}

function isLoopbackHost(host: string): boolean {
  const match = /^(127\.0\.0\.1|localhost)(?::(\d{1,5}))?$/.exec(host);
  if (!match) return false;
  if (!match[2]) return true;
  const port = Number(match[2]);
  return port >= 1 && port <= 65_535;
}

function isSameLoopbackOrigin(origin: string, host: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && parsed.host.toLowerCase() === host && parsed.origin === origin;
  } catch {
    return false;
  }
}

function isStateChangingMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
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
  if (
    !Array.isArray(body.accountIds) ||
    body.accountIds.length === 0 ||
    !body.accountIds.every((id) => typeof id === "string")
  ) {
    throw new PublicError("Choose at least one Gmail account.");
  }
  if (!Array.isArray(body.recipients) || !body.recipients.every(isContactInput)) {
    throw new PublicError("Recipients must be an array of contacts.");
  }

  const delayMinSeconds = nonNegativeNumber(body.delayMinSeconds, "minimum delay");
  const delayMaxSeconds = nonNegativeNumber(body.delayMaxSeconds, "maximum delay");
  if (delayMaxSeconds < delayMinSeconds) {
    throw new PublicError("Campaign maximum delay cannot be below its minimum delay.");
  }

  return {
    name: body.name as string,
    subject: body.subject as string,
    body: body.body as string,
    accountIds: body.accountIds,
    dailyCap: positiveNumber(body.dailyCap, "daily cap"),
    delayMinSeconds,
    delayMaxSeconds,
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

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value.trim()) throw new PublicError(message);
  return value.trim();
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new PublicError(`Campaign ${label} cannot be negative.`);
  }
  return value;
}

function publicAccount(account: Account) {
  return {
    id: account.id,
    email: account.email,
    label: account.label,
    capabilities: [...account.capabilities],
    dailyCap: account.dailyCap,
    delayMinSeconds: account.delayMinSeconds,
    delayMaxSeconds: account.delayMaxSeconds,
    timeZone: account.timeZone,
    sendingWindow: {
      days: [...account.sendingWindow.days],
      start: account.sendingWindow.start,
      end: account.sendingWindow.end,
    },
    ...(account.lastTestedAt ? { lastTestedAt: account.lastTestedAt } : {}),
  };
}

function firstParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

function singleQuery(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function requireOAuth(dependencies: AppDependencies): GoogleOAuthCoordinator {
  if (!dependencies.oauth || !dependencies.oauthRedirectUri) {
    throw new PublicError("Google OAuth is not configured in this TinyMails process.");
  }
  return dependencies.oauth;
}

function oauthResultPage(connected: boolean): string {
  const title = connected ? "Gmail is connected" : "Gmail could not be connected";
  const detail = connected
    ? "Return to TinyMails. You can close this window."
    : "Return to TinyMails and start the connection again.";
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
  <body>
    <h1>${title}</h1><p>${detail}</p>
  </body>
</html>`;
}

function sendOAuthResult(response: Response, connected: boolean, status: number): void {
  response
    .status(status)
    .set(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
    .type("html")
    .send(oauthResultPage(connected));
}

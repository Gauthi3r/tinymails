import type { CreateCampaignInput, CreateCampaignResult } from "../domain/campaigns";
import type { Account, Campaign, ContactList, Lead, LeadStatus, Template } from "../domain/types";
import type { MergeLeadsResult } from "../domain/leads";

export type PublicAccount = Omit<Account, "credentialDirectory">;
export type LeadView = Lead & { status: LeadStatus };
export type ContactListSummary = ContactList & { contactCount: number };

export interface LeadFilters {
  page?: number;
  pageSize?: number;
  query?: string;
  listId?: string;
  status?: LeadStatus | "";
}

export interface LeadsResponse {
  leads: LeadView[];
  counts: Record<string, number>;
  lists: ContactListSummary[];
  pagination: { page: number; pageSize: number; total: number; pages: number };
}

export type ImportTarget = { listId: string } | { listName: string };
export type ImportLeadsResponse = MergeLeadsResult & { list: ContactList };
export type BulkLeadSelection =
  | { mode: "emails"; emails: string[] }
  | {
      mode: "filter";
      query?: string;
      listId?: string;
      status?: LeadStatus | "";
      excludedEmails?: string[];
    };
export type BulkLeadOperation =
  | { type: "add-to-list"; listId: string }
  | { type: "remove-from-list"; listId: string }
  | { type: "delete" };
export interface BulkLeadResult {
  affected: number;
  skipped: number;
  skippedEmails: string[];
}

export interface SettingsResponse {
  accounts: PublicAccount[];
  dataDir: string;
  version: string;
  suppressionCount: number;
  /** Whether an agent connected over MCP may start a campaign. Off by default. */
  agentsCanStart: boolean;
  /** Absolute path of the stdio MCP command, when the server knows it. */
  mcpBridgePath?: string;
}

export type GoogleOAuthStatus =
  | { status: "pending" }
  | { status: "connected"; account: PublicAccount }
  | { status: "failed" | "expired"; message: string };

export interface AppApi {
  getCampaigns(): Promise<Campaign[]>;
  getLeads(filters?: LeadFilters): Promise<LeadsResponse>;
  getSettings(): Promise<SettingsResponse>;
  setAgentsCanStart(allowed: boolean): Promise<boolean>;
  startGoogleOAuth(client: unknown): Promise<{ sessionId: string; authorizationUrl: string }>;
  getGoogleOAuthStatus(sessionId: string): Promise<GoogleOAuthStatus>;
  sendTestEmail(accountId: string): Promise<{ ok: true; messageId: string }>;
  disconnectGoogleAccount(accountId: string): Promise<void>;
  updateAccount(
    accountId: string,
    input: Pick<Account, "dailyCap" | "delayMinSeconds" | "delayMaxSeconds" | "timeZone" | "sendingWindow">,
  ): Promise<PublicAccount>;
  importLeads(target: ImportTarget, leads: Array<Pick<Lead, "email" | "firstName" | "company">>): Promise<ImportLeadsResponse>;
  bulkUpdateLeads(selection: BulkLeadSelection, operation: BulkLeadOperation): Promise<BulkLeadResult>;
  createCampaign(input: Omit<CreateCampaignInput, "now">): Promise<CreateCampaignResult>;
  testCampaign(campaignId: string): Promise<Campaign>;
  startCampaign(campaignId: string): Promise<Campaign>;
  pauseCampaign(campaignId: string): Promise<Campaign>;
  stopCampaign(campaignId: string): Promise<Campaign>;
  suppressEmails(emails: string[]): Promise<string[]>;
  getTemplates(): Promise<Template[]>;
  saveTemplate(input: Pick<Template, "name" | "subject" | "body">): Promise<Template>;
}

export function createHttpApi(fetcher: typeof fetch = fetch): AppApi {
  return {
    async getCampaigns() {
      return (await getJson<{ campaigns: Campaign[] }>(fetcher, "/api/campaigns")).campaigns;
    },
    async getLeads(filters = {}) {
      const query = new URLSearchParams();
      if (filters.page) query.set("page", String(filters.page));
      if (filters.pageSize) query.set("pageSize", String(filters.pageSize));
      if (filters.query) query.set("query", filters.query);
      if (filters.listId) query.set("listId", filters.listId);
      if (filters.status) query.set("status", filters.status);
      const suffix = query.size > 0 ? `?${query}` : "";
      return getJson<LeadsResponse>(fetcher, `/api/leads${suffix}`);
    },
    async getSettings() {
      return getJson<SettingsResponse>(fetcher, "/api/settings");
    },
    async setAgentsCanStart(allowed) {
      return (await sendJson<{ agentsCanStart: boolean }>(fetcher, "/api/settings", { agentsCanStart: allowed })).agentsCanStart;
    },
    async startGoogleOAuth(client) {
      return sendJson(fetcher, "/api/oauth/google/start", { client });
    },
    async getGoogleOAuthStatus(sessionId) {
      return getJson<GoogleOAuthStatus>(fetcher, `/api/oauth/google/sessions/${encodeURIComponent(sessionId)}`);
    },
    async sendTestEmail(accountId) {
      return sendJson(fetcher, `/api/accounts/${encodeURIComponent(accountId)}/test-send`, {});
    },
    async disconnectGoogleAccount(accountId) {
      await sendJson(fetcher, `/api/accounts/${encodeURIComponent(accountId)}/disconnect`, {});
    },
    async updateAccount(accountId, input) {
      return (await sendJson<{ account: PublicAccount }>(
        fetcher,
        `/api/accounts/${encodeURIComponent(accountId)}/settings`,
        input,
      )).account;
    },
    async importLeads(target, leads) {
      return sendJson(fetcher, "/api/leads/import", { target, leads });
    },
    async bulkUpdateLeads(selection, operation) {
      return sendJson(fetcher, "/api/leads/bulk", { selection, operation });
    },
    async createCampaign(input) {
      return sendJson(fetcher, "/api/campaigns", input);
    },
    async testCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/test-send`, {})).campaign;
    },
    async startCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/start`, {})).campaign;
    },
    async pauseCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/pause`, {})).campaign;
    },
    async stopCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/stop`, {})).campaign;
    },
    async suppressEmails(emails) {
      return (await sendJson<{ emails: string[] }>(fetcher, "/api/suppression", { emails })).emails;
    },
    async getTemplates() {
      return (await getJson<{ templates: Template[] }>(fetcher, "/api/templates")).templates;
    },
    async saveTemplate(input) {
      return (await sendJson<{ template: Template }>(fetcher, "/api/templates", input)).template;
    },
  };
}

async function getJson<T>(fetcher: typeof fetch, path: string): Promise<T> {
  const response = await fetcher(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The local TinyMails service did not respond.");
  return response.json() as Promise<T>;
}

async function sendJson<T>(fetcher: typeof fetch, path: string, body: unknown): Promise<T> {
  const response = await fetcher(path, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // A bounded local fallback is clearer than leaking a parser or transport error.
  }
  return "The local TinyMails service could not complete that request.";
}

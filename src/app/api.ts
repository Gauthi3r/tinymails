import type { CreateCampaignInput, CreateCampaignResult } from "../domain/campaigns";
import type { Account, Campaign, Lead, LeadStatus, Reply, Template } from "../domain/types";
import type { MergeLeadsResult } from "../domain/leads";

export type PublicAccount = Omit<Account, "credentialDirectory">;
export type LeadView = Lead & { status: LeadStatus };

export interface LeadsResponse {
  leads: LeadView[];
  counts: Record<string, number>;
  sources: string[];
}

export interface SettingsResponse {
  accounts: PublicAccount[];
  dataDir: string;
  version: string;
  suppressionCount: number;
}

export type GoogleOAuthStatus =
  | { status: "pending" }
  | { status: "connected"; account: PublicAccount }
  | { status: "failed" | "expired"; message: string };

export interface AppApi {
  getCampaigns(): Promise<Campaign[]>;
  getLeads(): Promise<LeadsResponse>;
  getReplies(): Promise<Reply[]>;
  getSettings(): Promise<SettingsResponse>;
  startGoogleOAuth(client: unknown): Promise<{ sessionId: string; authorizationUrl: string }>;
  getGoogleOAuthStatus(sessionId: string): Promise<GoogleOAuthStatus>;
  sendTestEmail(accountId: string): Promise<{ ok: true; messageId: string }>;
  importLeads(source: string, leads: Array<Pick<Lead, "email" | "firstName" | "company">>): Promise<MergeLeadsResult>;
  createCampaign(input: Omit<CreateCampaignInput, "now">): Promise<CreateCampaignResult>;
  startCampaign(campaignId: string): Promise<Campaign>;
  pauseCampaign(campaignId: string): Promise<Campaign>;
  suppressEmails(emails: string[]): Promise<string[]>;
  getTemplates(): Promise<Template[]>;
  saveTemplate(input: Pick<Template, "name" | "subject" | "body">): Promise<Template>;
}

export function createHttpApi(fetcher: typeof fetch = fetch): AppApi {
  return {
    async getCampaigns() {
      return (await getJson<{ campaigns: Campaign[] }>(fetcher, "/api/campaigns")).campaigns;
    },
    async getLeads() {
      return getJson<LeadsResponse>(fetcher, "/api/leads");
    },
    async getReplies() {
      return (await getJson<{ replies: Reply[] }>(fetcher, "/api/replies")).replies;
    },
    async getSettings() {
      return getJson<SettingsResponse>(fetcher, "/api/settings");
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
    async importLeads(source, leads) {
      return sendJson(fetcher, "/api/leads/import", { source, leads });
    },
    async createCampaign(input) {
      return sendJson(fetcher, "/api/campaigns", input);
    },
    async startCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/start`, {})).campaign;
    },
    async pauseCampaign(campaignId) {
      return (await sendJson<{ campaign: Campaign }>(fetcher, `/api/campaigns/${encodeURIComponent(campaignId)}/pause`, {})).campaign;
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

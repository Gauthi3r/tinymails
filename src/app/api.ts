import type { Account, Campaign, Lead, LeadStatus, Reply } from "../domain/types";

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

export interface AppApi {
  getCampaigns(): Promise<Campaign[]>;
  getLeads(): Promise<LeadsResponse>;
  getReplies(): Promise<Reply[]>;
  getSettings(): Promise<SettingsResponse>;
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
  };
}

async function getJson<T>(fetcher: typeof fetch, path: string): Promise<T> {
  const response = await fetcher(path, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The local TinyMails service did not respond.");
  return response.json() as Promise<T>;
}

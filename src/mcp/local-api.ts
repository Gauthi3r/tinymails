import type { CampaignExclusion } from "../domain/campaigns";
import type { Account, AppSettings, Campaign, ContactInput } from "../domain/types";

export type PublicAccount = Omit<Account, "credentialDirectory">;

export interface QueueCampaignRequest {
  name: string;
  subject: string;
  body: string;
  accountIds: string[];
  dailyCap: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  recipients: ContactInput[];
}

/**
 * The few calls the MCP tools need, made against TinyMails' own local HTTP
 * API: the same one its screens use. The MCP layer adds no second code path
 * into sending; every safeguard lives behind these routes.
 */
export class LocalApi {
  constructor(
    readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async accounts(): Promise<PublicAccount[]> {
    return (await this.get<{ accounts: PublicAccount[] }>("/api/accounts")).accounts;
  }

  async settings(): Promise<AppSettings> {
    return this.get<AppSettings>("/api/settings");
  }

  async campaigns(): Promise<Campaign[]> {
    return (await this.get<{ campaigns: Campaign[] }>("/api/campaigns")).campaigns;
  }

  queueCampaign(input: QueueCampaignRequest): Promise<{ campaign: Campaign; excluded: CampaignExclusion[] }> {
    return this.post("/api/campaigns", input);
  }

  async sendTest(campaignId: string): Promise<Campaign> {
    return (await this.post<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(campaignId)}/test-send`)).campaign;
  }

  async start(campaignId: string): Promise<Campaign> {
    return (await this.post<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(campaignId)}/start`)).campaign;
  }

  async pause(campaignId: string): Promise<Campaign> {
    return (await this.post<{ campaign: Campaign }>(`/api/campaigns/${encodeURIComponent(campaignId)}/pause`)).campaign;
  }

  async addDoNotContact(emails: string[]): Promise<string[]> {
    return (await this.post<{ emails: string[] }>("/api/suppression", { emails })).emails;
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path, { headers: { Accept: "application/json" } });
  }

  private post<T>(path: string, body: unknown = {}): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, init);
    } catch {
      throw new Error(
        `TinyMails is not running at ${this.baseUrl}. Ask the user to start it with "npm start" in the tinymails folder, then try again.`,
      );
    }
    if (!response.ok) throw new Error(await errorMessage(response));
    return response.json() as Promise<T>;
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // Fall through to the generic message: the body was not TinyMails JSON.
  }
  return "TinyMails could not complete that request.";
}

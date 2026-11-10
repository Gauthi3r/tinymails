import type {
  Account,
  AccountRepository,
  Campaign,
  CampaignRepository,
  SuppressionRepository,
} from "./product";

// In-memory stand-ins for the JSON files TinyMails keeps on disk. They follow
// the same contract as the product's CollectionRepository: callers get copies,
// and update() applies a function to a copy and stores the result.
export class MemoryCampaigns implements CampaignRepository {
  private readonly records = new Map<string, Campaign>();
  private readonly listeners = new Set<(campaign: Campaign) => void>();

  async get(id: string): Promise<Campaign | null> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  async list(): Promise<Campaign[]> {
    return [...this.records.values()].map((record) => structuredClone(record));
  }

  async save(campaign: Campaign): Promise<void> {
    this.store(campaign);
  }

  async update(id: string, update: (campaign: Campaign) => Campaign): Promise<Campaign | null> {
    const record = this.records.get(id);
    if (!record) return null;
    const updated = update(structuredClone(record));
    this.store(updated);
    return structuredClone(updated);
  }

  /** Synchronous read for the page, which only displays. */
  peek(id: string): Campaign | null {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  subscribe(listener: (campaign: Campaign) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private store(campaign: Campaign): void {
    this.records.set(campaign.id, structuredClone(campaign));
    for (const listener of this.listeners) listener(structuredClone(campaign));
  }
}

export class MemoryAccounts implements AccountRepository {
  private readonly records = new Map<string, Account>();

  constructor(accounts: Account[]) {
    for (const account of accounts) this.records.set(account.id, structuredClone(account));
  }

  async get(id: string): Promise<Account | null> {
    const record = this.records.get(id);
    return record ? structuredClone(record) : null;
  }

  set(account: Account): void {
    this.records.set(account.id, structuredClone(account));
  }
}

export class MemorySuppression implements SuppressionRepository {
  private readonly emails: Set<string>;

  constructor(emails: string[]) {
    this.emails = new Set(emails.map((email) => email.trim().toLowerCase()));
  }

  async has(email: string): Promise<boolean> {
    return this.emails.has(email.trim().toLowerCase());
  }

  all(): Set<string> {
    return new Set(this.emails);
  }
}

import { AsyncEntry } from "@napi-rs/keyring";

export interface StoredGoogleTokens {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
}

interface PersistentGoogleTokens {
  refreshToken: string;
}

interface CredentialEntry {
  getPassword(): Promise<string | null | undefined>;
  setPassword(value: string): Promise<void>;
  deleteCredential(): Promise<void | boolean>;
}

type CredentialEntryFactory = (accountId: string) => CredentialEntry;

export interface CredentialVault {
  get(accountId: string): Promise<StoredGoogleTokens | null>;
  set(accountId: string, tokens: StoredGoogleTokens): Promise<void>;
  delete(accountId: string): Promise<void>;
}

export class MemoryCredentialVault implements CredentialVault {
  private readonly records = new Map<string, StoredGoogleTokens>();

  async get(accountId: string): Promise<StoredGoogleTokens | null> {
    const tokens = this.records.get(accountId);
    return tokens ? structuredClone(tokens) : null;
  }

  async set(accountId: string, tokens: StoredGoogleTokens): Promise<void> {
    this.records.set(accountId, structuredClone(tokens));
  }

  async delete(accountId: string): Promise<void> {
    this.records.delete(accountId);
  }
}

export class KeyringCredentialVault implements CredentialVault {
  private readonly runtimeRecords = new Map<string, StoredGoogleTokens>();

  constructor(private readonly entryFactory: CredentialEntryFactory = entry) {}

  async get(accountId: string): Promise<StoredGoogleTokens | null> {
    const runtime = this.runtimeRecords.get(accountId);
    if (runtime) return structuredClone(runtime);
    try {
      const credential = this.entryFactory(accountId);
      const encoded = await credential.getPassword();
      if (!encoded) return null;
      const tokens = googleTokens(JSON.parse(encoded));
      await credential.setPassword(JSON.stringify(persistentGoogleTokens(tokens)));
      this.runtimeRecords.set(accountId, tokens);
      return structuredClone(tokens);
    } catch (error) {
      if (isMissingEntry(error)) return null;
      throw new Error("TinyMails could not read the operating-system credential store.");
    }
  }

  async set(accountId: string, tokens: StoredGoogleTokens): Promise<void> {
    try {
      await this.entryFactory(accountId).setPassword(JSON.stringify(persistentGoogleTokens(tokens)));
      this.runtimeRecords.set(accountId, structuredClone(tokens));
    } catch {
      throw new Error("TinyMails could not write to the operating-system credential store.");
    }
  }

  async delete(accountId: string): Promise<void> {
    try {
      await this.entryFactory(accountId).deleteCredential();
    } catch (error) {
      if (!isMissingEntry(error)) {
        throw new Error("TinyMails could not remove credentials from the operating-system store.");
      }
    } finally {
      this.runtimeRecords.delete(accountId);
    }
  }
}

export function persistentGoogleTokens(tokens: StoredGoogleTokens): PersistentGoogleTokens {
  return { refreshToken: tokens.refreshToken };
}

function googleTokens(value: unknown): StoredGoogleTokens {
  if (!value || typeof value !== "object") throw new Error("Invalid Google credential record");
  const record = value as Record<string, unknown>;
  if (typeof record.refreshToken !== "string" || !record.refreshToken) {
    throw new Error("Invalid Google credential record");
  }
  return {
    refreshToken: record.refreshToken,
    ...(typeof record.accessToken === "string" ? { accessToken: record.accessToken } : {}),
    ...(typeof record.expiryDate === "number" ? { expiryDate: record.expiryDate } : {}),
    ...(typeof record.scope === "string" ? { scope: record.scope } : {}),
    ...(typeof record.tokenType === "string" ? { tokenType: record.tokenType } : {}),
  };
}

function entry(accountId: string): CredentialEntry {
  return new AsyncEntry("TinyMails", `google:${accountId}`);
}

function isMissingEntry(error: unknown): boolean {
  return error instanceof Error && /no entry|not found|no matching/i.test(error.message);
}

import { AsyncEntry } from "@napi-rs/keyring";

export interface StoredGoogleTokens {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  scope?: string;
  tokenType?: string;
  idToken?: string;
}

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
  async get(accountId: string): Promise<StoredGoogleTokens | null> {
    try {
      const encoded = await entry(accountId).getPassword();
      if (!encoded) return null;
      return JSON.parse(encoded) as StoredGoogleTokens;
    } catch (error) {
      if (isMissingEntry(error)) return null;
      throw new Error("TinyMails could not read the operating-system credential store.");
    }
  }

  async set(accountId: string, tokens: StoredGoogleTokens): Promise<void> {
    try {
      await entry(accountId).setPassword(JSON.stringify(tokens));
    } catch {
      throw new Error("TinyMails could not write to the operating-system credential store.");
    }
  }

  async delete(accountId: string): Promise<void> {
    try {
      await entry(accountId).deleteCredential();
    } catch (error) {
      if (!isMissingEntry(error)) {
        throw new Error("TinyMails could not remove credentials from the operating-system store.");
      }
    }
  }
}

function entry(accountId: string): AsyncEntry {
  return new AsyncEntry("TinyMails", `google:${accountId}`);
}

function isMissingEntry(error: unknown): boolean {
  return error instanceof Error && /no entry|not found|no matching/i.test(error.message);
}

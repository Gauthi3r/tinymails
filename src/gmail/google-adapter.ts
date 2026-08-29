import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { OAuth2Client } from "google-auth-library";
import type { Account, OutgoingMessage } from "../domain/types";
import type {
  AccountStatus,
  GmailAccountAdapter,
  SendResult,
} from "./adapter";
import type { CredentialVault, StoredGoogleTokens } from "./credential-vault";
import { GmailMessageError, createRawGmailMessage } from "./message";
import type { DesktopOAuthClient } from "./oauth-client";

export interface GoogleRequest {
  method: "GET" | "POST";
  url: string;
  data?: unknown;
}

export interface GoogleTransport {
  ensureAccess(): Promise<void>;
  request<T>(request: GoogleRequest): Promise<T>;
  credentials(): StoredGoogleTokens;
}

export interface GoogleTransportFactory {
  create(client: DesktopOAuthClient, tokens: StoredGoogleTokens): GoogleTransport;
}

interface GoogleGmailAdapterOptions {
  dataDir: string;
  vault: CredentialVault;
  transportFactory?: GoogleTransportFactory;
}

export class GoogleGmailAdapter implements GmailAccountAdapter {
  private readonly transportFactory: GoogleTransportFactory;

  constructor(private readonly options: GoogleGmailAdapterOptions) {
    this.transportFactory = options.transportFactory ?? new GoogleAuthTransportFactory();
  }

  async status(account: Account): Promise<AccountStatus> {
    try {
      const transport = await this.transport(account);
      await transport.ensureAccess();
      await this.options.vault.set(account.id, transport.credentials());
      return { connected: true, email: account.email };
    } catch {
      return disconnected(account.email);
    }
  }

  async send(account: Account, message: OutgoingMessage): Promise<SendResult> {
    let raw: string;
    try {
      raw = createRawGmailMessage(message);
    } catch (error) {
      if (error instanceof GmailMessageError) {
        return { ok: false, kind: "permanent", message: error.message };
      }
      throw error;
    }

    let transport: GoogleTransport;
    try {
      transport = await this.transport(account);
    } catch {
      return { ok: false, kind: "auth", message: reconnectMessage };
    }
    try {
      const response = await transport.request<{ id?: string }>({
        method: "POST",
        url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        data: { raw },
      });
      await this.options.vault.set(account.id, transport.credentials());
      if (!response.id) throw new Error("Gmail did not confirm the delivery identifier.");
      return { ok: true, messageId: response.id };
    } catch (error) {
      const status = responseStatus(error);
      if (status === null) throw error;
      if (status === 401 || status === 403) {
        return { ok: false, kind: "auth", message: reconnectMessage };
      }
      if (status === 408 || status === 429 || status >= 500) {
        return { ok: false, kind: "temporary", message: temporaryMessage };
      }
      return { ok: false, kind: "permanent", message: "Gmail rejected this message." };
    }
  }

  private async transport(account: Account): Promise<GoogleTransport> {
    const [client, tokens] = await Promise.all([
      readStoredClient(clientPath(this.options.dataDir, account.credentialDirectory)),
      this.options.vault.get(account.id),
    ]);
    if (!tokens?.refreshToken) throw new Error("Gmail credentials are unavailable");
    return this.transportFactory.create(client, tokens);
  }
}

class GoogleAuthTransportFactory implements GoogleTransportFactory {
  create(client: DesktopOAuthClient, tokens: StoredGoogleTokens): GoogleTransport {
    return new GoogleAuthTransport(client, tokens);
  }
}

class GoogleAuthTransport implements GoogleTransport {
  private readonly oauth: OAuth2Client;

  constructor(client: DesktopOAuthClient, tokens: StoredGoogleTokens) {
    this.oauth = new OAuth2Client({ clientId: client.clientId, clientSecret: client.clientSecret });
    this.oauth.setCredentials({
      [refreshTokenKey]: tokens.refreshToken,
      ...(tokens.accessToken ? { [accessTokenKey]: tokens.accessToken } : {}),
      ...(tokens.expiryDate ? { [expiryDateKey]: tokens.expiryDate } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      ...(tokens.tokenType ? { [tokenTypeKey]: tokens.tokenType } : {}),
      ...(tokens.idToken ? { [idTokenKey]: tokens.idToken } : {}),
    });
  }

  async ensureAccess(): Promise<void> {
    const access = await this.oauth.getAccessToken();
    if (!access.token) throw new Error("Google access is unavailable");
  }

  async request<T>(request: GoogleRequest): Promise<T> {
    const response = await this.oauth.request<T>({
      method: request.method,
      url: request.url,
      ...(request.data === undefined ? {} : { data: request.data }),
    });
    return response.data;
  }

  credentials(): StoredGoogleTokens {
    const tokens = this.oauth.credentials;
    if (!tokens.refresh_token) throw new Error("Google refresh credentials are unavailable");
    return {
      refreshToken: tokens.refresh_token,
      ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
      ...(tokens.expiry_date ? { expiryDate: tokens.expiry_date } : {}),
      ...(tokens.scope ? { scope: tokens.scope } : {}),
      ...(tokens.token_type ? { tokenType: tokens.token_type } : {}),
      ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
    };
  }
}

async function readStoredClient(path: string): Promise<DesktopOAuthClient> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<DesktopOAuthClient>;
  if (
    typeof parsed.clientId !== "string" ||
    typeof parsed.clientSecret !== "string" ||
    parsed.authUri !== "https://accounts.google.com/o/oauth2/auth" ||
    parsed.tokenUri !== "https://oauth2.googleapis.com/token"
  ) {
    throw new Error("The stored Google client is invalid");
  }
  return parsed as DesktopOAuthClient;
}

function clientPath(dataDir: string, credentialDirectory: string): string {
  const root = resolve(dataDir);
  const path = resolve(root, credentialDirectory, "client.json");
  if (!path.startsWith(`${root}${sep}`)) throw new Error("The credential directory is invalid");
  return path;
}

function responseStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== "object") return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function disconnected(email: string): AccountStatus {
  return { connected: false, email, message: reconnectMessage };
}

const refreshTokenKey = "refresh_token";
const accessTokenKey = "access_token";
const expiryDateKey = "expiry_date";
const tokenTypeKey = "token_type";
const idTokenKey = "id_token";
const reconnectMessage = "Reconnect this Gmail account in Settings.";
const temporaryMessage = "Gmail is temporarily unavailable. Try again shortly.";

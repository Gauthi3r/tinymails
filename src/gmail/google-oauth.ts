import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix, resolve, sep } from "node:path";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { normalizeEmail } from "../domain/email";
import type { Account } from "../domain/types";
import type { CollectionRepository } from "../server/repositories";
import type { CredentialVault, StoredGoogleTokens } from "./credential-vault";
import { parseDesktopOAuthClient, type DesktopOAuthClient } from "./oauth-client";

export const GOOGLE_SEND_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
] as const;

const SESSION_LIFETIME_MS = 10 * 60 * 1_000;

export interface AuthorizationInput {
  client: DesktopOAuthClient;
  redirectUri: string;
  state: string;
  scopes: string[];
}

export interface AuthorizationRequest {
  authorizationUrl: string;
  codeVerifier: string;
}

export interface CodeExchangeInput {
  client: DesktopOAuthClient;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}

export interface GoogleIdentity {
  email: string;
  tokens: StoredGoogleTokens;
}

export interface GoogleOAuthProvider {
  createAuthorization(input: AuthorizationInput): Promise<AuthorizationRequest>;
  exchangeCode(input: CodeExchangeInput): Promise<GoogleIdentity>;
}

type PublicAccount = Omit<Account, "credentialDirectory">;

export type GoogleOAuthStatus =
  | { status: "pending" }
  | { status: "connected"; account: PublicAccount }
  | { status: "failed"; message: string }
  | { status: "expired"; message: string };

interface PendingSession {
  sessionId: string;
  oauthState: string;
  client: DesktopOAuthClient;
  redirectUri: string;
  codeVerifier: string;
  expiresAt: number;
  result: GoogleOAuthStatus;
}

interface GoogleOAuthServiceOptions {
  dataDir: string;
  accounts: CollectionRepository<Account>;
  vault: CredentialVault;
  provider: GoogleOAuthProvider;
  clock?: () => Date;
  createId?: () => string;
  createSecret?: () => string;
}

export class GoogleOAuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleOAuthFlowError";
  }
}

export class GoogleOAuthService {
  private readonly sessions = new Map<string, PendingSession>();
  private readonly sessionIdByState = new Map<string, string>();
  private accountMutation = Promise.resolve();
  private readonly clock: () => Date;
  private readonly createId: () => string;
  private readonly createSecret: () => string;

  constructor(private readonly options: GoogleOAuthServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.createSecret = options.createSecret ?? (() => randomBytes(32).toString("base64url"));
  }

  async start(clientJson: unknown, redirectUri: string): Promise<{ sessionId: string; authorizationUrl: string }> {
    const client = parseDesktopOAuthClient(clientJson);
    const sessionId = this.createSecret();
    const oauthState = this.createSecret();
    const authorization = await this.options.provider.createAuthorization({
      client,
      redirectUri,
      state: oauthState,
      scopes: [...GOOGLE_SEND_SCOPES],
    });
    const session: PendingSession = {
      sessionId,
      oauthState,
      client,
      redirectUri,
      codeVerifier: authorization.codeVerifier,
      expiresAt: this.clock().getTime() + SESSION_LIFETIME_MS,
      result: { status: "pending" },
    };
    this.sessions.set(sessionId, session);
    this.sessionIdByState.set(oauthState, sessionId);
    return { sessionId, authorizationUrl: authorization.authorizationUrl };
  }

  async finish(oauthState: string, code: string): Promise<{ accountId: string }> {
    const sessionId = this.sessionIdByState.get(oauthState);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session || session.result.status !== "pending" || this.isExpired(session)) {
      if (session) this.expire(session);
      throw invalidSessionError();
    }

    this.sessionIdByState.delete(oauthState);
    try {
      const identity = await this.options.provider.exchangeCode({
        client: session.client,
        redirectUri: session.redirectUri,
        code,
        codeVerifier: session.codeVerifier,
      });
      const email = normalizeEmail(identity.email);
      if (!email || !identity.tokens.refreshToken) throw new Error("Invalid Google identity");
      const account = await this.serializeAccountMutation(async () => {
        const existing = (await this.options.accounts.list()).find((item) => item.email === email);
        const accountId = existing?.id ?? this.createId();
        const credentialDirectory = existing?.credentialDirectory ?? posix.join("accounts", accountId);
        const account: Account = existing
          ? reconnectAccount(existing)
          : {
              id: accountId,
              email,
              label: "Gmail",
              capabilities: ["send"],
              dailyCap: 25,
              delayMinSeconds: 30,
              delayMaxSeconds: 45,
              timeZone: localTimeZone(),
              sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
              credentialDirectory,
            };

        await writePrivateJson(join(this.options.dataDir, credentialDirectory, "client.json"), session.client);
        await this.options.vault.set(accountId, identity.tokens);
        await this.options.accounts.save(account);
        return account;
      });
      session.result = { status: "connected", account: publicAccount(account) };
      return { accountId: account.id };
    } catch {
      session.result = { status: "failed", message: "Google authorization could not be completed." };
      throw new GoogleOAuthFlowError("Google authorization could not be completed.");
    }
  }

  status(sessionId: string): GoogleOAuthStatus {
    const session = this.sessions.get(sessionId);
    if (!session) return { status: "failed", message: "This Google authorization session was not found." };
    if (session.result.status === "pending" && this.isExpired(session)) this.expire(session);
    return structuredClone(session.result);
  }

  async disconnect(accountId: string): Promise<void> {
    await this.serializeAccountMutation(async () => {
      const account = await this.options.accounts.get(accountId);
      if (!account) throw new GoogleOAuthFlowError("This Gmail account is not connected.");
      const accountsRoot = resolve(this.options.dataDir, "accounts");
      const credentialDirectory = resolve(this.options.dataDir, account.credentialDirectory);
      if (!credentialDirectory.startsWith(`${accountsRoot}${sep}`)) {
        throw new GoogleOAuthFlowError("TinyMails refused to remove an unsafe credential path.");
      }
      await this.options.vault.delete(accountId);
      await rm(credentialDirectory, { recursive: true, force: true });
      await this.options.accounts.delete(accountId);
    });
  }

  private isExpired(session: PendingSession): boolean {
    return this.clock().getTime() > session.expiresAt;
  }

  private expire(session: PendingSession): void {
    this.sessionIdByState.delete(session.oauthState);
    session.result = {
      status: "expired",
      message: "This Google authorization session expired. Start again.",
    };
  }

  private async serializeAccountMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.accountMutation;
    let release!: () => void;
    this.accountMutation = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

export class GoogleAuthLibraryProvider implements GoogleOAuthProvider {
  async createAuthorization(input: AuthorizationInput): Promise<AuthorizationRequest> {
    const oauth = oauthClient(input.client, input.redirectUri);
    const verifier = await oauth.generateCodeVerifierAsync();
    return {
      authorizationUrl: oauth.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: input.scopes,
        state: input.state,
        code_challenge: verifier.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }),
      codeVerifier: verifier.codeVerifier,
    };
  }

  async exchangeCode(input: CodeExchangeInput): Promise<GoogleIdentity> {
    const oauth = oauthClient(input.client, input.redirectUri);
    const { tokens } = await oauth.getToken({
      code: input.code,
      codeVerifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    });
    oauth.setCredentials(tokens);
    const response = await oauth.request<{ email?: string; email_verified?: boolean }>({
      url: "https://openidconnect.googleapis.com/v1/userinfo",
    });
    if (!response.data.email || response.data.email_verified !== true || !tokens.refresh_token) {
      throw new Error("Google did not return a verified email and refresh token");
    }
    return {
      email: response.data.email,
      tokens: {
        refreshToken: tokens.refresh_token,
        ...(tokens.access_token ? { accessToken: tokens.access_token } : {}),
        ...(tokens.expiry_date ? { expiryDate: tokens.expiry_date } : {}),
        ...(tokens.scope ? { scope: tokens.scope } : {}),
        ...(tokens.token_type ? { tokenType: tokens.token_type } : {}),
      },
    };
  }
}

function oauthClient(client: DesktopOAuthClient, redirectUri: string): OAuth2Client {
  return new OAuth2Client({ clientId: client.clientId, clientSecret: client.clientSecret, redirectUri });
}

function publicAccount(account: Account): PublicAccount {
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

function reconnectAccount(account: Account): Account {
  const { lastTestedAt: _lastTestedAt, ...reconnected } = account;
  return reconnected;
}

function invalidSessionError(): GoogleOAuthFlowError {
  return new GoogleOAuthFlowError("This Google authorization session is invalid or expired.");
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const directory = dirname(path);
  const temporaryPath = join(directory, `${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

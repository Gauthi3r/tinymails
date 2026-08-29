import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { MemoryCredentialVault } from "../src/gmail/credential-vault";
import {
  GoogleAuthLibraryProvider,
  GoogleOAuthFlowError,
  GoogleOAuthService,
  GOOGLE_SEND_SCOPES,
  type AuthorizationInput,
  type CodeExchangeInput,
  type GoogleIdentity,
  type GoogleOAuthProvider,
} from "../src/gmail/google-oauth";
import { createRepositories, type Repositories } from "../src/server/repositories";

const startedAt = new Date("2026-08-29T10:00:00.000Z");

describe("Google OAuth sessions", () => {
  let dataDir: string;
  let repositories: Repositories;
  let vault: MemoryCredentialVault;
  let provider: FakeGoogleOAuthProvider;
  let currentTime: Date;
  let service: GoogleOAuthService;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "tinymails-oauth-"));
    repositories = createRepositories(dataDir);
    vault = new MemoryCredentialVault();
    provider = new FakeGoogleOAuthProvider();
    currentTime = startedAt;
    let accountNumber = 0;
    let secretNumber = 0;
    service = new GoogleOAuthService({
      dataDir,
      accounts: repositories.accounts,
      vault,
      provider,
      clock: () => currentTime,
      createId: () => `account-${++accountNumber}`,
      createSecret: () => `secret-${++secretNumber}`,
    });
  });

  it("starts a send-only PKCE session with a random state", async () => {
    const result = await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");

    expect(result.sessionId).toBe("secret-1");
    expect(result.authorizationUrl).toContain("accounts.google.test/authorize");
    expect(provider.authorizations[0]).toMatchObject({
      state: "secret-2",
      scopes: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    });
    expect(provider.authorizations[0].state).not.toBe(result.sessionId);
  });

  it("rejects a callback with an unknown state", async () => {
    await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");

    await expect(service.finish("wrong-state", "authorization-code")).rejects.toThrowError(
      new GoogleOAuthFlowError("This Google authorization session is invalid or expired."),
    );
  });

  it("expires a pending session after ten minutes", async () => {
    const started = await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");
    currentTime = new Date("2026-08-29T10:10:01.000Z");

    expect(service.status(started.sessionId)).toEqual({
      status: "expired",
      message: "This Google authorization session expired. Start again.",
    });
    await expect(service.finish(provider.authorizations[0].state, "authorization-code")).rejects.toThrowError(
      new GoogleOAuthFlowError("This Google authorization session is invalid or expired."),
    );
  });

  it("stores the client privately, puts tokens in the vault, and creates the account", async () => {
    const started = await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");

    await service.finish(provider.authorizations[0].state, "authorization-code");

    const account = await repositories.accounts.get("account-1");
    expect(account).toMatchObject({
      id: "account-1",
      email: "sender@example.com",
      capabilities: ["send"],
      credentialDirectory: "accounts/account-1",
    });
    expect(await vault.get("account-1")).toEqual({
      refreshToken: "test-refresh-token",
      accessToken: "test-access-token",
    });
    const clientPath = join(dataDir, "accounts", "account-1", "client.json");
    expect(JSON.parse(await readFile(clientPath, "utf8"))).toMatchObject({
      clientId: "123456789.apps.googleusercontent.com",
      projectId: "tinymails-example",
    });
    expect((await stat(clientPath)).mode & 0o777).toBe(0o600);
    expect(service.status(started.sessionId)).toEqual({
      status: "connected",
      account: expect.objectContaining({ id: "account-1", email: "sender@example.com" }),
    });
  });

  it("uses a different directory and vault record for each account", async () => {
    await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");
    await service.finish(provider.authorizations[0].state, "authorization-code");
    provider.identity = {
      email: "second@example.org",
      tokens: { refreshToken: "second-refresh-token" },
    };
    await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");
    await service.finish(provider.authorizations[1].state, "authorization-code");

    expect((await repositories.accounts.list()).map((account) => account.credentialDirectory)).toEqual([
      "accounts/account-1",
      "accounts/account-2",
    ]);
    expect(await vault.get("account-1")).toMatchObject({ refreshToken: "test-refresh-token" });
    expect(await vault.get("account-2")).toMatchObject({ refreshToken: "second-refresh-token" });
  });

  it("reconnects an existing Gmail identity without creating a second account", async () => {
    await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");
    await service.finish(provider.authorizations[0].state, "authorization-code");
    const original = await repositories.accounts.get("account-1");
    expect(original).not.toBeNull();
    await repositories.accounts.save({
      ...original!,
      lastTestedAt: "2026-08-29T09:00:00.000Z",
    });
    provider.identity.tokens = { refreshToken: "replacement-refresh-token" };

    const reconnected = await service.start(
      desktopClient(),
      "http://127.0.0.1:3210/api/oauth/google/callback",
    );
    const result = await service.finish(provider.authorizations[1].state, "authorization-code");

    expect(result.accountId).toBe("account-1");
    expect(await repositories.accounts.list()).toHaveLength(1);
    expect(await vault.get("account-1")).toMatchObject({ refreshToken: "replacement-refresh-token" });
    expect(await repositories.accounts.get("account-1")).not.toHaveProperty("lastTestedAt");
    expect(service.status(reconnected.sessionId)).toEqual({
      status: "connected",
      account: expect.objectContaining({ id: "account-1", email: "sender@example.com" }),
    });
  });

  it("records a browser-safe failure without exposing the provider error", async () => {
    const started = await service.start(desktopClient(), "http://127.0.0.1:3210/api/oauth/google/callback");
    provider.exchangeError = new Error("raw provider response with private detail");

    await expect(service.finish(provider.authorizations[0].state, "authorization-code")).rejects.toThrowError(
      new GoogleOAuthFlowError("Google authorization could not be completed."),
    );
    expect(service.status(started.sessionId)).toEqual({
      status: "failed",
      message: "Google authorization could not be completed.",
    });
  });
});

describe("Google authorization request", () => {
  it("does not fold scopes from earlier grants into the TinyMails token", async () => {
    const provider = new GoogleAuthLibraryProvider();
    const authorization = await provider.createAuthorization({
      client: {
        clientId: "123456789.apps.googleusercontent.com",
        clientSecret: "test-client-secret",
        projectId: "tinymails-example",
        authUri: "https://accounts.google.com/o/oauth2/auth",
        tokenUri: "https://oauth2.googleapis.com/token",
      },
      redirectUri: "http://127.0.0.1:3210/api/oauth/google/callback",
      state: "state-value",
      scopes: [...GOOGLE_SEND_SCOPES],
    });

    const url = new URL(authorization.authorizationUrl);
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
  });
});

class FakeGoogleOAuthProvider implements GoogleOAuthProvider {
  readonly authorizations: AuthorizationInput[] = [];
  identity: GoogleIdentity = {
    email: "sender@example.com",
    tokens: { refreshToken: "test-refresh-token", accessToken: "test-access-token" },
  };
  exchangeError: Error | null = null;

  async createAuthorization(input: AuthorizationInput) {
    this.authorizations.push(structuredClone(input));
    return {
      authorizationUrl: `https://accounts.google.test/authorize?state=${input.state}`,
      codeVerifier: "test-code-verifier",
    };
  }

  async exchangeCode(_input: CodeExchangeInput): Promise<GoogleIdentity> {
    if (this.exchangeError) throw this.exchangeError;
    return structuredClone(this.identity);
  }
}

function desktopClient() {
  return {
    installed: {
      client_id: "123456789.apps.googleusercontent.com",
      project_id: "tinymails-example",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      [clientSecretKey]: "test-client-secret",
      redirect_uris: ["http://localhost"],
    },
  };
}

const clientSecretKey = "client_secret";

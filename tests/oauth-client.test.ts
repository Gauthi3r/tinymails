import { describe, expect, it } from "vitest";
import {
  KeyringCredentialVault,
  MemoryCredentialVault,
  persistentGoogleTokens,
} from "../src/gmail/credential-vault";
import { OAuthClientValidationError, parseDesktopOAuthClient } from "../src/gmail/oauth-client";

describe("Google Desktop OAuth client validation", () => {
  it("accepts a Google Desktop client and keeps only required fields", () => {
    expect(parseDesktopOAuthClient(desktopClient())).toEqual({
      clientId: "123456789.apps.googleusercontent.com",
      clientSecret: "test-client-secret",
      projectId: "tinymails-example",
      authUri: "https://accounts.google.com/o/oauth2/auth",
      tokenUri: "https://oauth2.googleapis.com/token",
    });
  });

  it("rejects a web OAuth client", () => {
    expect(() => parseDesktopOAuthClient({ web: desktopClient().installed })).toThrowError(
      new OAuthClientValidationError("Choose a Desktop app OAuth client JSON file."),
    );
  });

  it("rejects a missing client secret without echoing input", () => {
    const input = desktopClient();
    delete input.installed[clientSecretKey];

    expect(() => parseDesktopOAuthClient(input)).toThrowError(
      new OAuthClientValidationError("The OAuth client file is missing required fields."),
    );
  });

  it("rejects non-Google authorization endpoints", () => {
    const input = desktopClient();
    input.installed.auth_uri = "https://attacker.invalid/authorize";

    expect(() => parseDesktopOAuthClient(input)).toThrowError(
      new OAuthClientValidationError("The OAuth client file does not use Google's endpoints."),
    );
  });
});

describe("credential vault", () => {
  it("projects only the refresh token into persistent storage", () => {
    expect(persistentGoogleTokens({
      refreshToken: "test-refresh-token",
      accessToken: "test-access-token",
      expiryDate: 2_000_000_000_000,
      scope: "openid gmail.send",
      tokenType: "Bearer",
    })).toEqual({ refreshToken: "test-refresh-token" });
  });

  it("keeps access credentials in memory while writing only the refresh token to the keyring", async () => {
    const persisted = new Map<string, string>();
    const vault = new KeyringCredentialVault((accountId) => ({
      getPassword: async () => persisted.get(accountId) ?? null,
      setPassword: async (value: string) => { persisted.set(accountId, value); },
      deleteCredential: async () => { persisted.delete(accountId); },
    }));
    const tokens = {
      refreshToken: "test-refresh-token",
      accessToken: "test-access-token",
      expiryDate: 2_000_000_000_000,
    };

    await vault.set("account-1", tokens);

    expect(persisted.get("account-1")).toBe('{"refreshToken":"test-refresh-token"}');
    expect(await vault.get("account-1")).toEqual(tokens);
  });

  it("shrinks an existing full keyring record when it is first read", async () => {
    const persisted = new Map([[
      "account-1",
      JSON.stringify({
        refreshToken: "test-refresh-token",
        accessToken: "legacy-access-token",
        expiryDate: 2_000_000_000_000,
        idToken: "unused-identity-token",
      }),
    ]]);
    const vault = new KeyringCredentialVault((accountId) => ({
      getPassword: async () => persisted.get(accountId) ?? null,
      setPassword: async (value: string) => { persisted.set(accountId, value); },
      deleteCredential: async () => { persisted.delete(accountId); },
    }));

    expect(await vault.get("account-1")).toEqual({
      refreshToken: "test-refresh-token",
      accessToken: "legacy-access-token",
      expiryDate: 2_000_000_000_000,
    });
    expect(persisted.get("account-1")).toBe('{"refreshToken":"test-refresh-token"}');
  });

  it("round trips tokens without sharing object references", async () => {
    const vault = new MemoryCredentialVault();
    const tokens = { refreshToken: "test-refresh-token", accessToken: "test-access-token" };

    await vault.set("account-1", tokens);
    tokens.accessToken = "changed";

    expect(await vault.get("account-1")).toEqual({
      refreshToken: "test-refresh-token",
      accessToken: "test-access-token",
    });
  });

  it("returns null for an account without credentials", async () => {
    expect(await new MemoryCredentialVault().get("missing")).toBeNull();
  });
});

function desktopClient(): { installed: Record<string, string | string[] | undefined> } {
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

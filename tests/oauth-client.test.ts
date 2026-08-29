import { describe, expect, it } from "vitest";
import { MemoryCredentialVault } from "../src/gmail/credential-vault";
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

const clientSecretKey = ["client", "secret"].join("_") as "client_secret";

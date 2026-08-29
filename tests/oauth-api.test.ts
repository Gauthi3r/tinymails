import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { FakeGmailAccountAdapter } from "../src/gmail/fake-adapter";
import type { GoogleOAuthStatus } from "../src/gmail/google-oauth";
import { createApp, type GoogleOAuthCoordinator } from "../src/server/app";
import { createRepositories, type Repositories } from "../src/server/repositories";

describe("Google connection API", () => {
  let repositories: Repositories;
  let gmail: FakeGmailAccountAdapter;
  let oauth: FakeOAuthCoordinator;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-oauth-api-"));
    repositories = createRepositories(dataDir);
    await repositories.accounts.save(accountFixture());
    gmail = new FakeGmailAccountAdapter();
    oauth = new FakeOAuthCoordinator();
    app = createApp({
      repositories,
      gmail,
      dataDir,
      oauth,
      oauthRedirectUri: "http://127.0.0.1:3210/api/oauth/google/callback",
    });
  });

  it("starts OAuth without accepting a browser-provided redirect URI", async () => {
    const client = { installed: { client_id: "example" } };
    const response = await request(app)
      .post("/api/oauth/google/start")
      .send({ client, redirectUri: "https://attacker.example.com/callback" })
      .expect(200);

    expect(response.body).toEqual({
      sessionId: "session-1",
      authorizationUrl: "https://accounts.google.test/authorize",
    });
    expect(oauth.starts[0]).toEqual({
      client,
      redirectUri: "http://127.0.0.1:3210/api/oauth/google/callback",
    });
  });

  it("finishes the callback and serves a bounded close-window page", async () => {
    const response = await request(app)
      .get("/api/oauth/google/callback?state=oauth-state&code=authorization-code")
      .expect(200);

    expect(oauth.finishes).toEqual([{ state: "oauth-state", code: "authorization-code" }]);
    expect(response.text).toContain("Gmail is connected");
    expect(response.text).not.toContain("authorization-code");
  });

  it("returns the browser-safe session status", async () => {
    oauth.currentStatus = { status: "failed", message: "Google authorization could not be completed." };

    const response = await request(app).get("/api/oauth/google/sessions/session-1").expect(200);

    expect(response.body).toEqual(oauth.currentStatus);
  });

  it("sends a connection test only to the connected account itself", async () => {
    const response = await request(app).post("/api/accounts/account-1/test-send").expect(200);

    expect(response.body).toEqual({ ok: true, messageId: "fake-message-1" });
    expect(gmail.sent).toEqual([
      {
        accountId: "account-1",
        message: expect.objectContaining({ to: "sender@example.com", subject: "TinyMails is connected" }),
      },
    ]);
  });
});

class FakeOAuthCoordinator implements GoogleOAuthCoordinator {
  starts: Array<{ client: unknown; redirectUri: string }> = [];
  finishes: Array<{ state: string; code: string }> = [];
  currentStatus: GoogleOAuthStatus = { status: "pending" };

  async start(client: unknown, redirectUri: string) {
    this.starts.push({ client: structuredClone(client), redirectUri });
    return {
      sessionId: "session-1",
      authorizationUrl: "https://accounts.google.test/authorize",
    };
  }

  async finish(state: string, code: string) {
    this.finishes.push({ state, code });
    return { accountId: "account-1" };
  }

  status(_sessionId: string): GoogleOAuthStatus {
    return structuredClone(this.currentStatus);
  }
}

function accountFixture(): Account {
  return {
    id: "account-1",
    email: "sender@example.com",
    label: "Main Gmail",
    capabilities: ["send"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    timeZone: "UTC",
    sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    credentialDirectory: "accounts/account-1",
  };
}

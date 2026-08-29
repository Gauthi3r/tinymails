import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { MemoryCredentialVault, type StoredGoogleTokens } from "../src/gmail/credential-vault";
import {
  GoogleGmailAdapter,
  type GoogleRequest,
  type GoogleTransport,
  type GoogleTransportFactory,
} from "../src/gmail/google-adapter";

describe("Google Gmail adapter", () => {
  let dataDir: string;
  let vault: MemoryCredentialVault;
  let transport: FakeGoogleTransport;
  let adapter: GoogleGmailAdapter;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), "tinymails-gmail-"));
    vault = new MemoryCredentialVault();
    transport = new FakeGoogleTransport();
    const factory: GoogleTransportFactory = { create: () => transport };
    adapter = new GoogleGmailAdapter({ dataDir, vault, transportFactory: factory });
    await mkdir(join(dataDir, "accounts", "account-1"), { recursive: true });
    await writeFile(
      join(dataDir, "accounts", "account-1", "client.json"),
      JSON.stringify({
        clientId: "123456789.apps.googleusercontent.com",
        clientSecret: "client-value",
        authUri: "https://accounts.google.com/o/oauth2/auth",
        tokenUri: "https://oauth2.googleapis.com/token",
      }),
    );
    await vault.set("account-1", { refreshToken: "refresh-value", accessToken: "access-value" });
  });

  it("sends an encoded message through the account-specific Gmail endpoint", async () => {
    const result = await adapter.send(account(), {
      to: "person@example.com",
      subject: "A tiny hello",
      body: "Hello there.",
    });

    expect(result).toEqual({ ok: true, messageId: "gmail-message-1" });
    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]).toMatchObject({
      method: "POST",
      url: "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    });
    expect(Buffer.from((transport.requests[0].data as { raw: string }).raw, "base64url").toString("utf8"))
      .toContain("To: person@example.com");
  });

  it("persists refreshed credentials after a request", async () => {
    transport.nextTokens = {
      refreshToken: "refresh-value",
      accessToken: "new-access-value",
      expiryDate: 2_000_000_000_000,
    };

    await adapter.send(account(), { to: "person@example.com", subject: "Hello", body: "Body" });

    expect(await vault.get("account-1")).toEqual(transport.nextTokens);
  });

  it.each([
    { status: 401, kind: "auth", message: "Reconnect this Gmail account in Settings." },
    { status: 429, kind: "temporary", message: "Gmail is temporarily unavailable. Try again shortly." },
    { status: 500, kind: "temporary", message: "Gmail is temporarily unavailable. Try again shortly." },
    { status: 400, kind: "permanent", message: "Gmail rejected this message." },
  ] as const)("maps a $status response to a safe $kind result", async ({ status, kind, message }) => {
    transport.error = Object.assign(new Error("private provider detail"), { response: { status } });

    await expect(
      adapter.send(account(), { to: "person@example.com", subject: "Hello", body: "Body" }),
    ).resolves.toEqual({ ok: false, kind, message });
  });

  it("lets ambiguous network failures reach the campaign safety boundary", async () => {
    transport.error = new Error("socket ended after upload");

    await expect(
      adapter.send(account(), { to: "person@example.com", subject: "Hello", body: "Body" }),
    ).rejects.toThrow("socket ended after upload");
  });

  it("treats a successful response without a message id as an ambiguous delivery", async () => {
    transport.responseId = undefined;

    await expect(
      adapter.send(account(), { to: "person@example.com", subject: "Hello", body: "Body" }),
    ).rejects.toThrow("Gmail did not confirm the delivery identifier.");
  });

  it("reports a missing credential record as disconnected", async () => {
    await vault.delete("account-1");

    await expect(adapter.status(account())).resolves.toEqual({
      connected: false,
      email: "sender@example.com",
      message: "Reconnect this Gmail account in Settings.",
    });
  });

  it("maps missing credentials to auth before attempting delivery", async () => {
    await vault.delete("account-1");

    await expect(
      adapter.send(account(), { to: "person@example.com", subject: "Hello", body: "Body" }),
    ).resolves.toEqual({
      ok: false,
      kind: "auth",
      message: "Reconnect this Gmail account in Settings.",
    });
    expect(transport.requests).toHaveLength(0);
  });
});

class FakeGoogleTransport implements GoogleTransport {
  requests: GoogleRequest[] = [];
  error: Error | null = null;
  nextTokens: StoredGoogleTokens = { refreshToken: "refresh-value", accessToken: "access-value" };
  responseId: string | undefined = "gmail-message-1";

  async ensureAccess(): Promise<void> {
    if (this.error) throw this.error;
  }

  async request<T>(request: GoogleRequest): Promise<T> {
    this.requests.push(structuredClone(request));
    if (this.error) throw this.error;
    return { id: this.responseId } as T;
  }

  credentials() {
    return structuredClone(this.nextTokens);
  }
}

function account(): Account {
  return {
    id: "account-1",
    email: "sender@example.com",
    label: "Gmail",
    capabilities: ["send"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    timeZone: "Europe/Lisbon",
    sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    credentialDirectory: "accounts/account-1",
  };
}

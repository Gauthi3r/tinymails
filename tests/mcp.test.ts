import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mkdtemp } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { FakeGmailAccountAdapter } from "../src/gmail/fake-adapter";
import { createApp } from "../src/server/app";
import { createRepositories, type Repositories } from "../src/server/repositories";

// A weekday inside the default sending window.
const now = new Date("2026-08-31T10:00:00.000Z");

describe("MCP connection", () => {
  let repositories: Repositories;
  let gmail: FakeGmailAccountAdapter;
  let server: Server;
  let baseUrl: string;
  let clients: Client[];

  beforeEach(async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-mcp-"));
    repositories = createRepositories(dataDir);
    await repositories.accounts.save(accountFixture());
    gmail = new FakeGmailAccountAdapter();
    const app = createApp({ repositories, gmail, dataDir, clock: () => now });
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    clients = [];
  });

  afterEach(async () => {
    await Promise.all(clients.map((client) => client.close()));
    await new Promise((resolve) => server.close(resolve));
  });

  async function connect(): Promise<Client> {
    const client = new Client({ name: "test-agent", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
    clients.push(client);
    return client;
  }

  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    return { isError: result.isError === true, text, data: result.isError ? null : JSON.parse(text) };
  }

  it("offers queueing, testing, checking and pausing, and no way to start", async () => {
    const client = await connect();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "add_do_not_contact",
      "get_campaigns",
      "list_accounts",
      "pause_campaign",
      "queue_campaign",
      "send_test",
    ]);
    expect(client.getInstructions()).toContain("You cannot start it for them.");
  });

  it("lists the connected Gmail account without its credential location", async () => {
    const client = await connect();

    const { data, text } = await call(client, "list_accounts");

    expect(data.accounts).toEqual([
      expect.objectContaining({ id: "account-1", email: "sender@example.com", dailyCap: 25 }),
    ]);
    expect(text).not.toContain("credentialDirectory");
  });

  it("queues a paused campaign with the account's own limits and reports exclusions", async () => {
    await repositories.suppression.add(["blocked@example.com"]);
    const client = await connect();

    const { data } = await call(client, "queue_campaign", {
      name: "Design partners",
      subject: "Thanks, {firstName}",
      body: "Hi {firstName}",
      recipients: [
        { email: "ada@example.com", firstName: "Ada" },
        { email: "ada@example.com" },
        { email: "blocked@example.com" },
        { email: "not-an-address" },
      ],
    });

    expect(data.campaign).toMatchObject({ status: "paused", tested: false, dailyCap: 25, counts: { total: 1, pending: 1 } });
    expect(data.sendingFrom).toBe("sender@example.com");
    expect(data.excluded).toEqual([
      { email: "ada@example.com", reason: "duplicate" },
      { email: "blocked@example.com", reason: "do-not-contact" },
      { email: "not-an-address", reason: "invalid" },
    ]);
    expect(gmail.sent).toEqual([]);
    expect(await repositories.campaigns.list()).toEqual([
      expect.objectContaining({ status: "paused", delayMinSeconds: 30, delayMaxSeconds: 45 }),
    ]);
  });

  it("asks which account to use when several are connected", async () => {
    await repositories.accounts.save(accountFixture({ id: "account-2", email: "second@example.com" }));
    const client = await connect();

    const result = await call(client, "queue_campaign", {
      name: "Design partners",
      subject: "Hello",
      body: "Hi",
      recipients: [{ email: "ada@example.com" }],
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("pass the accountId");
    expect(await repositories.campaigns.list()).toEqual([]);
  });

  it("sends the test to the user's own address and leaves starting to them", async () => {
    const client = await connect();
    const queued = await call(client, "queue_campaign", {
      name: "Design partners",
      subject: "Thanks, {firstName}",
      body: "Hi {firstName}",
      recipients: [{ email: "ada@example.com", firstName: "Ada" }],
    });

    const tested = await call(client, "send_test", { campaignId: queued.data.campaign.id });

    expect(gmail.sent).toEqual([
      { accountId: "account-1", message: { to: "sender@example.com", subject: "Thanks, Ada", body: "Hi Ada" } },
    ]);
    expect(tested.data.campaign).toMatchObject({ status: "paused", tested: true });
    expect(tested.data.next).toContain("press Start in TinyMails");

    const started = await client.callTool({ name: "start_campaign", arguments: { campaignId: queued.data.campaign.id } })
      .then((result) => result.isError === true, () => true);
    expect(started).toBe(true);
    expect((await repositories.campaigns.list())[0].status).toBe("paused");
  });

  it("starts a campaign only after the user allows agents to", async () => {
    await repositories.settings.update({ agentsCanStart: true });
    const client = await connect();
    const queued = await call(client, "queue_campaign", {
      name: "Design partners",
      subject: "Hello",
      body: "Hi",
      recipients: [{ email: "ada@example.com" }],
    });
    const campaignId = queued.data.campaign.id as string;

    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("start_campaign");
    const untested = await call(client, "start_campaign", { campaignId });
    expect(untested.isError).toBe(true);
    expect(untested.text).toContain("before starting");

    await call(client, "send_test", { campaignId });
    const started = await call(client, "start_campaign", { campaignId });

    expect(started.data.campaign.status).toBe("running");
  });

  it("reports progress, and one campaign's recipients on request", async () => {
    const client = await connect();
    const queued = await call(client, "queue_campaign", {
      name: "Design partners",
      subject: "Hello",
      body: "Hi",
      recipients: [{ email: "ada@example.com" }, { email: "grace@example.org" }],
    });

    const all = await call(client, "get_campaigns");
    const one = await call(client, "get_campaigns", { campaignId: queued.data.campaign.id });

    expect(all.data.campaigns).toEqual([expect.objectContaining({ name: "Design partners", counts: expect.objectContaining({ total: 2 }) })]);
    expect(all.text).not.toContain("ada@example.com");
    expect(one.data.campaign.recipients).toEqual([
      { email: "ada@example.com", status: "pending" },
      { email: "grace@example.org", status: "pending" },
    ]);
  });

  it("pauses a running campaign and adds to the do-not-contact list", async () => {
    const client = await connect();
    await repositories.campaigns.save({
      id: "campaign-1",
      name: "Running",
      subject: "Hello",
      body: "Hi",
      accountIds: ["account-1"],
      dailyCap: 25,
      delayMinSeconds: 30,
      delayMaxSeconds: 45,
      createdAt: now.toISOString(),
      status: "running",
      waitingReason: "The Gmail account's daily cap has been reached.",
      resumesAt: "2026-09-01T09:00:00.000Z",
      recipients: [{ email: "ada@example.com", accountId: "account-1", status: "pending" }],
    });

    const paused = await call(client, "pause_campaign", { campaignId: "campaign-1" });
    const blocked = await call(client, "add_do_not_contact", { emails: ["Ada@Example.com"] });

    expect(paused.data.campaign).toMatchObject({ status: "paused", pauseReason: "Paused manually." });
    expect(paused.data.campaign).not.toHaveProperty("waitingReason");
    expect(blocked.data).toEqual({ doNotContactCount: 1 });
    expect(await repositories.suppression.list()).toEqual(["ada@example.com"]);
  });

  it("answers agents that still speak the 2025 protocol", async () => {
    const post = (body: unknown) => fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(body),
    });

    const initialized = await post({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "older-agent", version: "1.0.0" } },
    });
    const listed = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    expect(initialized.status).toBe(200);
    expect(await initialized.text()).toContain('"name":"tinymails"');
    expect(await listed.text()).toContain("queue_campaign");
  });

  it("serves the same tools to an agent that starts a command", async () => {
    const bridge = join(dirname(dirname(fileURLToPath(import.meta.url))), "scripts", "mcp.mjs");
    const client = new Client({ name: "test-agent", version: "1.0.0" });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [bridge],
      env: { ...(process.env as Record<string, string>), TINYMAILS_PORT: new URL(baseUrl).port },
    }));
    clients.push(client);

    const { data } = await call(client, "list_accounts");

    expect((await client.listTools()).tools).toHaveLength(6);
    expect(data.accounts).toEqual([expect.objectContaining({ email: "sender@example.com" })]);
  });

  it("refuses a browser page on another origin", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example.com" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });

    expect(response.status).toBe(403);
  });
});

function accountFixture(overrides: Partial<Account> = {}): Account {
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
    lastTestedAt: now.toISOString(),
    ...overrides,
  };
}

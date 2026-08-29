import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { FakeGmailAccountAdapter } from "../src/gmail/fake-adapter";
import { createApp } from "../src/server/app";
import { createRepositories, type Repositories } from "../src/server/repositories";

const now = new Date("2026-08-29T10:00:00.000Z");

describe("local API", () => {
  let repositories: Repositories;
  let app: ReturnType<typeof createApp>;
  let gmail: FakeGmailAccountAdapter;

  beforeEach(async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-api-"));
    repositories = createRepositories(dataDir);
    await repositories.accounts.save(accountFixture());
    gmail = new FakeGmailAccountAdapter();
    app = createApp({
      repositories,
      gmail,
      dataDir,
      clock: () => now,
    });
  });

  it("rejects non-loopback Host headers before exposing local data", async () => {
    const settings = await request(app)
      .get("/api/settings")
      .set("Host", "attacker.example.com")
      .expect(403);
    const backup = await request(app)
      .get("/api/backup")
      .set("Host", "attacker.example.com:3210")
      .expect(403);

    expect(settings.body).toEqual({ error: "TinyMails only accepts requests from its local address." });
    expect(backup.body).toEqual({ error: "TinyMails only accepts requests from its local address." });
  });

  it("rejects cross-origin state changes even with a loopback Host", async () => {
    await request(app)
      .post("/api/campaigns")
      .set("Host", "127.0.0.1:3210")
      .set("Origin", "https://attacker.example.com")
      .send({})
      .expect(403, { error: "TinyMails rejected a request from another website." });

    expect(await repositories.campaigns.list()).toEqual([]);
  });

  it("accepts same-origin state changes from either loopback hostname", async () => {
    await request(app)
      .post("/api/suppression")
      .set("Host", "localhost:3210")
      .set("Origin", "http://localhost:3210")
      .send({ emails: ["blocked@example.com"] })
      .expect(200);

    expect(await repositories.suppression.list()).toEqual(["blocked@example.com"]);
  });

  it("imports leads and returns derived status", async () => {
    await request(app)
      .post("/api/leads/import")
      .send({ source: "Product beta", leads: [{ email: "ada@example.com", firstName: "Ada" }] })
      .expect(200);

    const response = await request(app).get("/api/leads").expect(200);

    expect(response.body.leads).toEqual([
      expect.objectContaining({ email: "ada@example.com", status: "new" }),
    ]);
    expect(response.body.counts).toMatchObject({ total: 1, new: 1 });
  });

  it("creates a campaign without exposing blocked recipients", async () => {
    await request(app)
      .post("/api/suppression")
      .send({ emails: ["blocked@example.com"] })
      .expect(200);

    const response = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi {firstName}",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }, { email: "blocked@example.com" }],
      })
      .expect(201);

    expect(response.body.campaign.recipients.map((recipient: { email: string }) => recipient.email)).toEqual([
      "ready@example.com",
    ]);
    expect(response.body.excluded).toEqual([
      expect.objectContaining({ email: "blocked@example.com", reason: "do-not-contact" }),
    ]);
  });

  it("admits a recipient to only one campaign when requests arrive together", async () => {
    const campaign = {
      name: "Product update",
      subject: "A short update",
      body: "Hi there",
      accountIds: ["account-1"],
      dailyCap: 25,
      delayMinSeconds: 30,
      delayMaxSeconds: 45,
      recipients: [{ email: "ready@example.com" }],
    };

    const responses = await Promise.all([
      request(app).post("/api/campaigns").send({ ...campaign, name: "First" }),
      request(app).post("/api/campaigns").send({ ...campaign, name: "Second" }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const saved = await repositories.campaigns.list();
    expect(saved).toHaveLength(1);
    expect(saved[0].recipients).toHaveLength(1);
  });

  it("does not return local credential directories to the browser", async () => {
    const hiddenField = "client_secret";
    await repositories.accounts.save({
      ...accountFixture(),
      [hiddenField]: "must-not-leave-the-server",
    } as Account);
    const response = await request(app).get("/api/accounts").expect(200);

    expect(response.body.accounts[0]).toMatchObject({ id: "account-1", email: "sender@example.com" });
    expect(response.body.accounts[0]).not.toHaveProperty("credentialDirectory");
    expect(response.body.accounts[0]).not.toHaveProperty(hiddenField);
    expect(JSON.stringify(response.body)).not.toContain("/tmp/credentials");
  });

  it("updates account sending limits and an overnight window", async () => {
    const response = await request(app)
      .post("/api/accounts/account-1/settings")
      .send({
        dailyCap: 40,
        delayMinSeconds: 20,
        delayMaxSeconds: 60,
        timeZone: "Europe/Lisbon",
        sendingWindow: { days: [1, 3, 5], start: "22:00", end: "02:00" },
      })
      .expect(200);

    expect(response.body.account).toMatchObject({
      id: "account-1",
      dailyCap: 40,
      delayMinSeconds: 20,
      delayMaxSeconds: 60,
      timeZone: "Europe/Lisbon",
      sendingWindow: { days: [1, 3, 5], start: "22:00", end: "02:00" },
    });
    expect(response.body.account).not.toHaveProperty("credentialDirectory");
  });

  it("rejects invalid account sending settings", async () => {
    await request(app)
      .post("/api/accounts/account-1/settings")
      .send({
        dailyCap: 501,
        delayMinSeconds: 60,
        delayMaxSeconds: 20,
        timeZone: "Not/A_Time_Zone",
        sendingWindow: { days: [], start: "9am", end: "17:00" },
      })
      .expect(400, { error: "Gmail account daily cap must be a whole number from 1 to 500." });
  });

  it("rejects unknown Gmail accounts and reversed delay bounds", async () => {
    const base = {
      name: "Product update",
      subject: "A short update",
      body: "Hi there",
      dailyCap: 25,
      delayMinSeconds: 45,
      delayMaxSeconds: 30,
      recipients: [{ email: "ready@example.com" }],
    };

    await request(app)
      .post("/api/campaigns")
      .send({ ...base, accountIds: ["account-1"] })
      .expect(400, { error: "Campaign maximum delay cannot be below its minimum delay." });
    await request(app)
      .post("/api/campaigns")
      .send({ ...base, delayMinSeconds: 30, delayMaxSeconds: 45, accountIds: ["missing-account"] })
      .expect(400, { error: "Choose only connected Gmail accounts." });
  });

  it("rejects campaign caps above the local safety ceiling", async () => {
    await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 2_500,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(400, { error: "Campaign daily cap cannot exceed 500." });
  });

  it("requires a confirmed test send before campaign delivery starts", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(201);

    await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/start`)
      .expect(409, { error: "Send a test email from every assigned Gmail account before starting." });
  });

  it("tests the personalized campaign revision before allowing it to start", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A note for {company}",
        body: "Hi {firstName}, this is the preview.",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com", firstName: "Ada", company: "Example" }],
      })
      .expect(201);

    await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/start`)
      .expect(409);
    const tested = await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/test-send`)
      .send({})
      .expect(200);

    expect(gmail.sent).toEqual([
      expect.objectContaining({
        accountId: "account-1",
        message: {
          to: "sender@example.com",
          subject: "A note for Example",
          body: "Hi Ada, this is the preview.",
        },
      }),
    ]);
    expect(tested.body.campaign.testedAt).toBe(now.toISOString());
    expect((await repositories.accounts.get("account-1"))?.lastTestedAt).toBe(now.toISOString());
    await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/start`)
      .expect(202);
  });

  it("stops a paused campaign and releases every unsent recipient", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }, { email: "waiting@example.com" }],
      })
      .expect(201);

    const stopped = await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/stop`)
      .send({})
      .expect(200);

    expect(stopped.body.campaign).toMatchObject({
      status: "stopped",
      recipients: [
        { email: "ready@example.com", status: "not-sent" },
        { email: "waiting@example.com", status: "not-sent" },
      ],
    });

    const replacement = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Replacement",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(201);

    expect(replacement.body.campaign.recipients).toHaveLength(1);
  });

  it("requires a campaign to be paused before stopping it", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(201);
    await repositories.campaigns.update(created.body.campaign.id, (campaign) => ({
      ...campaign,
      status: "running",
    }));

    await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/stop`)
      .send({})
      .expect(409, { error: "Pause this campaign before stopping it." });
  });

  it("does not stop while an in-flight delivery is still settling", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Product update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(201);
    await repositories.campaigns.update(created.body.campaign.id, (campaign) => ({
      ...campaign,
      recipients: campaign.recipients.map((recipient) => ({ ...recipient, status: "sending" })),
    }));

    await request(app)
      .post(`/api/campaigns/${created.body.campaign.id}/stop`)
      .send({})
      .expect(409, { error: "Wait for the in-flight delivery to settle before stopping this campaign." });
  });

  it("returns a bounded validation error for malformed imports", async () => {
    const response = await request(app)
      .post("/api/leads/import")
      .send({ source: "Product beta", leads: "not-a-list" })
      .expect(400);

    expect(response.body).toEqual({ error: "Leads must be an array." });
  });

  it("accepts a reviewed import payload larger than the old 2 MB server limit", async () => {
    await request(app)
      .post("/api/leads/import")
      .send({
        source: "Large reviewed import",
        leads: [{ email: "person@example.com" }],
        padding: "x".repeat(3_000_000),
      })
      .expect(200);
  });

  it("returns a clear error when a JSON request exceeds the import allowance", async () => {
    await request(app)
      .post("/api/leads/import")
      .send({
        source: "Too large",
        leads: [{ email: "person@example.com" }],
        padding: "x".repeat(13_000_000),
      })
      .expect(413, { error: "That request is larger than TinyMails' 12 MB local limit." });
  });

  it("exports a portable backup without credential paths", async () => {
    const hiddenField = "client_secret";
    await repositories.accounts.save({
      ...accountFixture(),
      [hiddenField]: "must-not-leave-the-server",
    } as Account);
    await repositories.leads.update((leads) => [
      ...leads,
      { email: "ada@example.com", firstName: "Ada", source: "Beta", addedAt: now.toISOString() },
    ]);

    const response = await request(app).get("/api/backup").expect(200);

    expect(response.headers["content-disposition"]).toContain("tinymails-backup-2026-08-29.json");
    expect(response.body).toMatchObject({
      product: "TinyMails",
      version: "0.1.0",
      data: {
        accounts: [expect.objectContaining({ email: "sender@example.com" })],
        leads: [expect.objectContaining({ email: "ada@example.com" })],
        suppression: [],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("credentialDirectory");
    expect(JSON.stringify(response.body)).not.toContain(hiddenField);
    expect(JSON.stringify(response.body)).not.toContain("must-not-leave-the-server");
    expect(JSON.stringify(response.body)).not.toContain("/tmp/credentials");
  });

  it("saves reusable plain-text templates", async () => {
    const created = await request(app)
      .post("/api/templates")
      .send({ name: "Beta hello", subject: "A note for {company}", body: "Hi {firstName}," })
      .expect(201);

    expect(created.body.template).toMatchObject({
      name: "Beta hello",
      subject: "A note for {company}",
      body: "Hi {firstName},",
      updatedAt: now.toISOString(),
    });
    const listed = await request(app).get("/api/templates").expect(200);
    expect(listed.body.templates).toEqual([created.body.template]);
  });
});

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
    credentialDirectory: "/tmp/credentials/account-1",
  };
}

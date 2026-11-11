import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { FakeGmailAccountAdapter } from "../src/gmail/fake-adapter";
import { createApp } from "../src/server/app";
import { createRepositories, type Repositories } from "../src/server/repositories";
import { APP_VERSION } from "../src/version";

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

  it("keeps agents from starting campaigns until the user allows it", async () => {
    const initial = await request(app).get("/api/settings").expect(200);
    await request(app).post("/api/settings").send({ agentsCanStart: "yes" })
      .expect(400, { error: "Choose whether agents can start campaigns." });
    await request(app).post("/api/settings").send({ agentsCanStart: true }).expect(200, { agentsCanStart: true });
    const updated = await request(app).get("/api/settings").expect(200);

    expect(initial.body.agentsCanStart).toBe(false);
    expect(updated.body.agentsCanStart).toBe(true);
    expect(await repositories.settings.read()).toEqual({ agentsCanStart: true });
  });

  it("clears a waiting note when the user pauses", async () => {
    await repositories.campaigns.save({
      id: "campaign-waiting",
      name: "Waiting",
      subject: "Hello",
      body: "Hi",
      accountIds: ["account-1"],
      dailyCap: 25,
      delayMinSeconds: 30,
      delayMaxSeconds: 45,
      createdAt: now.toISOString(),
      status: "running",
      waitingReason: "The Gmail account's daily cap has been reached.",
      resumesAt: "2026-08-30T09:00:00.000Z",
      recipients: [{ email: "ada@example.com", accountId: "account-1", status: "pending" }],
    });

    const paused = await request(app).post("/api/campaigns/campaign-waiting/pause").expect(200);

    expect(paused.body.campaign).toMatchObject({ status: "paused", pauseReason: "Paused manually." });
    expect(paused.body.campaign).not.toHaveProperty("waitingReason");
    expect(paused.body.campaign).not.toHaveProperty("resumesAt");
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

  it("reports one injected release version across every metadata endpoint", async () => {
    const versionedApp = createApp({
      repositories,
      gmail,
      dataDir: "/tmp/tinymails-version-test",
      version: "9.8.7-test",
      clock: () => now,
    });

    const health = await request(versionedApp).get("/api/health").expect(200);
    const settings = await request(versionedApp).get("/api/settings").expect(200);
    const backup = await request(versionedApp).get("/api/backup").expect(200);

    expect(health.body.version).toBe("9.8.7-test");
    expect(settings.body.version).toBe("9.8.7-test");
    expect(backup.body.version).toBe("9.8.7-test");
  });

  it("imports leads and returns derived status", async () => {
    const imported = await request(app)
      .post("/api/leads/import")
      .send({ target: { listName: "Product beta" }, leads: [{ email: "ada@example.com", firstName: "Ada" }] })
      .expect(200);

    const response = await request(app).get("/api/leads").expect(200);

    expect(imported.body.list).toMatchObject({ name: "Product beta" });
    expect(response.body.leads).toEqual([
      expect.objectContaining({
        email: "ada@example.com",
        listIds: [imported.body.list.id],
        status: "new",
      }),
    ]);
    expect(response.body.counts).toMatchObject({ total: 1, new: 1 });
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 50, total: 1, pages: 1 });
  });

  it("reuses list names without regard to case and adds membership to known contacts", async () => {
    const first = await request(app)
      .post("/api/leads/import")
      .send({ target: { listName: "Product beta" }, leads: [{ email: "ada@example.com" }] })
      .expect(200);
    const second = await request(app)
      .post("/api/leads/import")
      .send({ target: { listName: "product BETA" }, leads: [{ email: "grace@example.com" }] })
      .expect(200);
    const third = await request(app)
      .post("/api/leads/import")
      .send({ target: { listName: "Founders" }, leads: [{ email: "ADA@example.com" }] })
      .expect(200);

    expect(second.body.list.id).toBe(first.body.list.id);
    const lists = await request(app).get("/api/lists").expect(200);
    expect(lists.body.lists).toEqual([
      expect.objectContaining({ id: third.body.list.id, name: "Founders", contactCount: 1 }),
      expect.objectContaining({ id: first.body.list.id, name: "Product beta", contactCount: 2 }),
    ]);
    expect((await repositories.leads.list()).find((lead) => lead.email === "ada@example.com")?.listIds)
      .toEqual([first.body.list.id, third.body.list.id]);
  });

  it("paginates and filters leads on the local server", async () => {
    const list = {
      id: "list-beta",
      name: "Beta",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await repositories.lists.save(list);
    await repositories.leads.saveAll(Array.from({ length: 125 }, (_, index) => ({
      email: `person-${String(index).padStart(3, "0")}@example.com`,
      firstName: index === 124 ? "Ada" : `Person ${index}`,
      listIds: [list.id],
      addedAt: new Date(now.getTime() + index * 1_000).toISOString(),
    })));
    await repositories.suppression.add(["person-000@example.com"]);

    const page = await request(app)
      .get("/api/leads?page=2&pageSize=50&listId=list-beta&status=new")
      .expect(200);
    expect(page.body.pagination).toEqual({ page: 2, pageSize: 50, total: 124, pages: 3 });
    expect(page.body.leads).toHaveLength(50);
    expect(page.body.leads.every((lead: { status: string }) => lead.status === "new")).toBe(true);

    const lastPage = await request(app)
      .get("/api/leads?page=99&pageSize=500&query=Ada")
      .expect(200);
    expect(lastPage.body.pagination).toEqual({ page: 1, pageSize: 100, total: 1, pages: 1 });
    expect(lastPage.body.leads).toEqual([
      expect.objectContaining({ email: "person-124@example.com", firstName: "Ada" }),
    ]);
  });

  it("adds and removes selected contacts from lists in bulk", async () => {
    const beta = await request(app)
      .post("/api/leads/import")
      .send({
        target: { listName: "Beta" },
        leads: [{ email: "ada@example.com" }, { email: "grace@example.com" }],
      })
      .expect(200);
    const founders = await request(app)
      .post("/api/leads/import")
      .send({ target: { listName: "Founders" }, leads: [{ email: "linus@example.com" }] })
      .expect(200);

    const added = await request(app)
      .post("/api/leads/bulk")
      .send({
        selection: { mode: "emails", emails: ["ADA@example.com"] },
        operation: { type: "add-to-list", listId: founders.body.list.id },
      })
      .expect(200);
    expect(added.body).toMatchObject({ affected: 1, skipped: 0 });

    const removed = await request(app)
      .post("/api/leads/bulk")
      .send({
        selection: {
          mode: "filter",
          listId: beta.body.list.id,
          excludedEmails: ["grace@example.com"],
        },
        operation: { type: "remove-from-list", listId: beta.body.list.id },
      })
      .expect(200);
    expect(removed.body).toMatchObject({ affected: 1, skipped: 0 });

    const leads = await repositories.leads.list();
    expect(leads.find((lead) => lead.email === "ada@example.com")?.listIds)
      .toEqual([founders.body.list.id]);
    expect(leads.find((lead) => lead.email === "grace@example.com")?.listIds)
      .toEqual([beta.body.list.id]);
  });

  it("deletes contacts and unsent recipients while preserving delivery audit rows", async () => {
    await repositories.lists.save({
      id: "list-beta",
      name: "Beta",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    const statuses = ["pending", "not-sent", "sent", "failed", "sending"] as const;
    await repositories.leads.saveAll(statuses.map((status) => ({
      email: `${status}@example.com`,
      listIds: ["list-beta"],
      addedAt: now.toISOString(),
    })));
    await repositories.campaigns.save({
      id: "campaign-audit",
      name: "Audit",
      subject: "Hello",
      body: "Hi",
      accountIds: ["account-1"],
      dailyCap: 25,
      delayMinSeconds: 30,
      delayMaxSeconds: 45,
      createdAt: now.toISOString(),
      status: "paused",
      recipients: statuses.map((status) => ({
        email: `${status}@example.com`,
        accountId: "account-1",
        status,
      })),
    });

    const deleted = await request(app)
      .post("/api/leads/bulk")
      .send({
        selection: { mode: "filter", listId: "list-beta" },
        operation: { type: "delete" },
      })
      .expect(200);

    expect(deleted.body).toEqual({
      affected: 4,
      skipped: 1,
      skippedEmails: ["sending@example.com"],
    });
    expect((await repositories.leads.list()).map((lead) => lead.email)).toEqual([
      "sending@example.com",
    ]);
    expect((await repositories.campaigns.get("campaign-audit"))?.recipients.map((recipient) => ({
      email: recipient.email,
      status: recipient.status,
    }))).toEqual([
      { email: "sent@example.com", status: "sent" },
      { email: "failed@example.com", status: "failed" },
      { email: "sending@example.com", status: "sending" },
    ]);
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

  it("does not move stopped or completed campaigns back to paused", async () => {
    const created = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Finished update",
        subject: "A short update",
        body: "Hi there",
        accountIds: ["account-1"],
        dailyCap: 25,
        delayMinSeconds: 30,
        delayMaxSeconds: 45,
        recipients: [{ email: "ready@example.com" }],
      })
      .expect(201);

    for (const status of ["stopped", "done"] as const) {
      await repositories.campaigns.update(created.body.campaign.id, (campaign) => ({ ...campaign, status }));

      await request(app)
        .post(`/api/campaigns/${created.body.campaign.id}/pause`)
        .send({})
        .expect(409, { error: "Only a running campaign can be paused." });
      expect((await repositories.campaigns.get(created.body.campaign.id))?.status).toBe(status);
    }
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
      .send({ target: { listName: "Product beta" }, leads: "not-a-list" })
      .expect(400);

    expect(response.body).toEqual({ error: "Leads must be an array." });
  });

  it("accepts a reviewed import payload larger than the old 2 MB server limit", async () => {
    await request(app)
      .post("/api/leads/import")
      .send({
        target: { listName: "Large reviewed import" },
        leads: [{ email: "person@example.com" }],
        padding: "x".repeat(3_000_000),
      })
      .expect(200);
  });

  it("returns a clear error when a JSON request exceeds the import allowance", async () => {
    await request(app)
      .post("/api/leads/import")
      .send({
        target: { listName: "Too large" },
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
      { email: "ada@example.com", firstName: "Ada", listIds: ["list-beta"], addedAt: now.toISOString() },
    ]);
    await repositories.lists.save({
      id: "list-beta",
      name: "Beta",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });

    const response = await request(app).get("/api/backup").expect(200);

    expect(response.headers["content-disposition"]).toContain("tinymails-backup-2026-08-29.json");
    expect(response.body).toMatchObject({
      product: "TinyMails",
      version: APP_VERSION,
      data: {
        accounts: [expect.objectContaining({ email: "sender@example.com" })],
        leads: [expect.objectContaining({ email: "ada@example.com" })],
        lists: [expect.objectContaining({ id: "list-beta", name: "Beta" })],
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

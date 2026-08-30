import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Account } from "../src/domain/types";
import { createRepositories } from "../src/server/repositories";

describe("local repositories", () => {
  it("keeps both records when collection saves overlap", async () => {
    const repositories = createRepositories(await mkdtemp(join(tmpdir(), "tinymails-repositories-")));

    await Promise.all([
      repositories.accounts.save(account("account-1", "one@example.com")),
      repositories.accounts.save(account("account-2", "two@example.com")),
    ]);

    expect((await repositories.accounts.list()).map((item) => item.id).sort()).toEqual([
      "account-1",
      "account-2",
    ]);
  });

  it("returns one record when matching collection creates overlap", async () => {
    const repositories = createRepositories(await mkdtemp(join(tmpdir(), "tinymails-repositories-")));
    const now = "2026-08-29T10:00:00.000Z";

    const [first, second] = await Promise.all([
      repositories.lists.findOrCreate(
        (list) => list.name.toLowerCase() === "beta",
        () => ({ id: "list-1", name: "Beta", createdAt: now, updatedAt: now }),
      ),
      repositories.lists.findOrCreate(
        (list) => list.name.toLowerCase() === "beta",
        () => ({ id: "list-2", name: "beta", createdAt: now, updatedAt: now }),
      ),
    ]);

    expect(first.id).toBe(second.id);
    expect(await repositories.lists.list()).toHaveLength(1);
  });

  it("keeps every address when suppression additions overlap", async () => {
    const repositories = createRepositories(await mkdtemp(join(tmpdir(), "tinymails-repositories-")));

    await Promise.all([
      repositories.suppression.add(["one@example.com"]),
      repositories.suppression.add(["two@example.com"]),
    ]);

    expect(await repositories.suppression.list()).toEqual(["one@example.com", "two@example.com"]);
  });

  it("migrates legacy sources to reusable list memberships", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-repositories-"));
    await writeFile(join(dataDir, "leads.json"), JSON.stringify([
      { email: "ada@example.com", source: "Product beta", addedAt: "2026-08-29T10:00:00.000Z" },
      { email: "grace@example.com", source: "product BETA", addedAt: "2026-08-29T10:00:00.000Z" },
    ]));
    const repositories = createRepositories(dataDir);

    const migrated = await repositories.leads.list();
    const lists = await repositories.lists.list();

    expect(lists).toHaveLength(1);
    expect(lists[0].name).toBe("Product beta");
    expect(migrated.map((lead) => lead.listIds)).toEqual([[lists[0].id], [lists[0].id]]);
    expect(await repositories.leads.list()).toEqual(migrated);
    expect(await readFile(join(dataDir, "leads.json"), "utf8")).not.toContain("source");
  });

  it("uses an Imported contacts list for a blank legacy source", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-repositories-"));
    await writeFile(join(dataDir, "leads.json"), JSON.stringify([
      { email: "ada@example.com", source: "", addedAt: "2026-08-29T10:00:00.000Z" },
    ]));
    const repositories = createRepositories(dataDir);

    const leads = await repositories.leads.list();
    const lists = await repositories.lists.list();

    expect(lists).toEqual([expect.objectContaining({ name: "Imported contacts" })]);
    expect(leads[0].listIds).toEqual([lists[0].id]);
  });
});

function account(id: string, email: string): Account {
  return {
    id,
    email,
    label: id,
    capabilities: ["send"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    timeZone: "UTC",
    sendingWindow: { days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
    credentialDirectory: `/tmp/${id}`,
  };
}

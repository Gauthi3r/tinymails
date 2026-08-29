import { mkdtemp } from "node:fs/promises";
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

  it("keeps every address when suppression additions overlap", async () => {
    const repositories = createRepositories(await mkdtemp(join(tmpdir(), "tinymails-repositories-")));

    await Promise.all([
      repositories.suppression.add(["one@example.com"]),
      repositories.suppression.add(["two@example.com"]),
    ]);

    expect(await repositories.suppression.list()).toEqual(["one@example.com", "two@example.com"]);
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

import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanTree } from "../scripts/scan-public.mjs";

describe("public tree scanner", () => {
  it("flags credentials, runtime files, and non-example email addresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    const credentialFile = ["token", "cache.json"].join("_");
    const leakedToken = ["ya", "29.", "A".repeat(30)].join("");
    const privateAddress = ["person", "private", "invalid"].join("@").replace("@invalid", ".invalid");
    await writeFile(join(root, credentialFile), JSON.stringify({ value: leakedToken }));
    await writeFile(join(root, "notes.txt"), `contact ${privateAddress}`);

    const findings = await scanTree(root);

    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["credential-file", "email-address", "secret-token"]),
    );
  });

  it("allows documented example addresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    await writeFile(join(root, "README.md"), "Send a test to you@example.com");

    expect(await scanTree(root)).toEqual([]);
  });

  it("skips files that git ignores, since they cannot reach the public tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    execFileSync("git", ["-C", root, "init", "-q"]);
    const privateAddress = ["person", "private", "invalid"].join("@").replace("@invalid", ".invalid");
    await mkdir(join(root, "private"), { recursive: true });
    await writeFile(join(root, ".gitignore"), "private/\n");
    await writeFile(join(root, "private", "notes.txt"), `contact ${privateAddress}`);
    await writeFile(join(root, "README.md"), "Public docs use you@example.com only.");

    expect(await scanTree(root)).toEqual([]);
  });

  it("checks planning documents against caller-supplied private terms", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    const planningDir = join(root, "docs", "superpowers");
    await mkdir(planningDir, { recursive: true });
    const privateTerm = "former-product";
    const privateAddress = ["person", "private", "invalid"].join("@").replace("@invalid", ".invalid");
    await writeFile(
      join(planningDir, "migration.md"),
      `Migrated from ${privateTerm}. Contact ${privateAddress}.`,
    );

    expect(await scanTree(root, { privateTerms: [privateTerm] })).toEqual([
      { rule: "email-address", path: "docs/superpowers/migration.md" },
      { rule: "private-name", path: "docs/superpowers/migration.md" },
    ]);
  });
});

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanTree } from "../scripts/scan-public.mjs";

describe("public tree scanner", () => {
  it("flags credentials, runtime files, and non-example email addresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    const credentialFile = ["token", "cache.json"].join("_");
    const credentialKey = ["refresh", "token"].join("_");
    const privateAddress = ["person", "private", "invalid"].join("@").replace("@invalid", ".invalid");
    await writeFile(join(root, credentialFile), JSON.stringify({ [credentialKey]: "secret" }));
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
});

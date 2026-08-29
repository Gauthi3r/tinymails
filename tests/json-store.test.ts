import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Campaign } from "../src/domain/types";
import { resolveDataDir } from "../src/server/data-dir";
import { JsonStore } from "../src/server/json-store";

describe("local data storage", () => {
  it("uses the explicit data directory", () => {
    expect(resolveDataDir({ TINYMAILS_DATA_DIR: "/tmp/tinymails-test" })).toBe(
      "/tmp/tinymails-test",
    );
  });

  it("round trips JSON without leaving a temporary file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinymails-store-"));
    const store = new JsonStore(join(dir, "campaigns.json"), [] as Campaign[]);
    const stored = [{ id: "campaign-1" }] as Campaign[];

    await store.write(stored);

    expect(await store.read()).toEqual(stored);
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("returns a fresh default value when its file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinymails-store-"));
    const store = new JsonStore(join(dir, "missing.json"), { items: [] as string[] });

    const first = await store.read();
    first.items.push("changed");

    expect(await store.read()).toEqual({ items: [] });
  });
});

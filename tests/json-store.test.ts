import { mkdtemp, readdir, stat } from "node:fs/promises";
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

  it("creates the application data directory with user-only permissions", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-store-"));
    const dataDir = join(root, "private-data");
    const store = new JsonStore(join(dataDir, "campaigns.json"), [] as Campaign[]);

    await store.write([]);

    expect((await stat(dataDir)).mode & 0o777).toBe(0o700);
  });

  it("returns a fresh default value when its file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinymails-store-"));
    const store = new JsonStore(join(dir, "missing.json"), { items: [] as string[] });

    const first = await store.read();
    first.items.push("changed");

    expect(await store.read()).toEqual({ items: [] });
  });

  it("uses a unique temporary file for overlapping writes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tinymails-store-"));
    const store = new JsonStore(join(dir, "state.json"), [] as number[]);

    await expect(Promise.all([store.write([1]), store.write([2])])).resolves.toBeDefined();
    expect([[1], [2]]).toContainEqual(await store.read());
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});

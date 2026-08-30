import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireDataDirectoryLock } from "../src/server/instance-lock";
import { honorsPosixModes } from "./platform";

describe("data-directory instance lock", () => {
  it("allows one owner and rejects a second process using the same data directory", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-lock-"));
    const first = await acquireDataDirectoryLock(dataDir, { pid: 101, startedAt: "2026-08-30T10:00:00.000Z" });

    await expect(
      acquireDataDirectoryLock(dataDir, { pid: 202, startedAt: "2026-08-30T10:01:00.000Z" }),
    ).rejects.toThrow("Another TinyMails process is already using this data directory");
    expect(JSON.parse(await readFile(join(dataDir, "instance.lock"), "utf8"))).toEqual({
      ownerId: expect.any(String),
      pid: 101,
      startedAt: "2026-08-30T10:00:00.000Z",
    });
    if (honorsPosixModes) {
      expect((await stat(join(dataDir, "instance.lock"))).mode & 0o777).toBe(0o600);
    }

    await first.release();
    const second = await acquireDataDirectoryLock(dataDir, { pid: 202, startedAt: "2026-08-30T10:01:00.000Z" });
    await second.release();
  });

  it("does not remove a lock whose owner changed before release", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-lock-owner-"));
    const lockPath = join(dataDir, "instance.lock");
    const lock = await acquireDataDirectoryLock(dataDir, { pid: 101, startedAt: "2026-08-30T10:00:00.000Z" });
    await writeFile(lockPath, JSON.stringify({ ownerId: "replacement", pid: 202 }));

    await lock.release();

    expect(JSON.parse(await readFile(lockPath, "utf8"))).toMatchObject({ ownerId: "replacement", pid: 202 });
  });
});

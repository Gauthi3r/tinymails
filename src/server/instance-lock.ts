import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync } from "node:fs";
import { chmod, mkdir, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface DataDirectoryLock {
  path: string;
  release(): Promise<void>;
  releaseSync(): void;
}

interface LockOptions {
  pid?: number;
  startedAt?: string;
}

interface LockOwner {
  ownerId: string;
  pid: number;
  startedAt: string;
}

export async function acquireDataDirectoryLock(
  dataDir: string,
  options: LockOptions = {},
): Promise<DataDirectoryLock> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await chmod(dataDir, 0o700);
  const path = join(dataDir, "instance.lock");
  const owner: LockOwner = {
    ownerId: randomUUID(),
    pid: options.pid ?? process.pid,
    startedAt: options.startedAt ?? new Date().toISOString(),
  };

  try {
    const descriptor = await open(path, "wx", 0o600);
    try {
      await descriptor.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
    } finally {
      await descriptor.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `Another TinyMails process is already using this data directory. Stop it before starting TinyMails again. `
        + `If no TinyMails process is running, remove the stale lock at ${path}.`,
      );
    }
    throw error;
  }

  let released = false;
  return {
    path,
    async release() {
      if (released) return;
      released = true;
      try {
        if ((await readOwner(path))?.ownerId === owner.ownerId) await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    releaseSync() {
      if (released) return;
      released = true;
      try {
        if (readOwnerSync(path)?.ownerId === owner.ownerId) unlinkSync(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

async function readOwner(path: string): Promise<LockOwner | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as LockOwner;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readOwnerSync(path: string): LockOwner | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LockOwner;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

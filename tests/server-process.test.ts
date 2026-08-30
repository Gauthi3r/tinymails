import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = new Set<ChildProcess>();

afterEach(async () => {
  await Promise.all([...children].map(stop));
});

describe("TinyMails server process", () => {
  it("rejects a second process using the same data directory on another port", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "tinymails-process-lock-"));
    const firstPort = await freePort();
    const secondPort = await freePort();
    const first = startServer(dataDir, firstPort);
    await outputMatching(first, /TinyMails is running/);

    const second = startServer(dataDir, secondPort);
    const result = await processResult(second);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Another TinyMails process is already using this data directory");
    await stop(first);
    await expect(access(join(dataDir, "instance.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  }, 15_000);
});

function startServer(dataDir: string, port: number): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server/index.ts"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      TINYMAILS_DATA_DIR: dataDir,
      TINYMAILS_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
  return port;
}

function outputMatching(child: ChildProcess, pattern: RegExp): Promise<void> {
  return new Promise((resolveOutput, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}: ${output}`)), 5_000);
    const receive = (chunk: Buffer) => {
      output += chunk.toString();
      if (!pattern.test(output)) return;
      clearTimeout(timeout);
      resolveOutput();
    };
    child.stdout?.on("data", receive);
    child.stderr?.on("data", receive);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}: ${output}`));
    });
  });
}

function processResult(child: ChildProcess): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Server did not exit: ${stderr}`));
    }, 5_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolveResult({ code, stderr });
    });
  });
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
}

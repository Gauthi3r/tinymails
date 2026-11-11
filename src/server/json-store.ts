import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export class JsonStore<T> {
  constructor(
    private readonly path: string,
    private readonly defaultValue: T,
  ) {}

  async read(): Promise<T> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(this.defaultValue);
      }
      throw error;
    }
  }

  async write(value: T): Promise<void> {
    const directory = dirname(this.path);
    const temporaryPath = join(directory, `${basename(this.path)}.${process.pid}.${randomUUID()}.tmp`);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await replaceFile(temporaryPath, this.path);
  }
}

const BUSY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const REPLACE_ATTEMPTS = 10;

/**
 * Moves a finished temporary file over its target. On Windows the move is
 * refused while another call is reading the target, which happens whenever
 * the screens or an agent check progress during a send, so a refusal is
 * retried for about two seconds before it counts as a failure.
 */
export async function replaceFile(
  temporaryPath: string,
  path: string,
  move: (from: string, to: string) => Promise<void> = rename,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await move(temporaryPath, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !BUSY_CODES.has(code) || attempt === REPLACE_ATTEMPTS) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(10 * 2 ** (attempt - 1), 400)));
    }
  }
}

import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
    await rename(temporaryPath, this.path);
  }
}

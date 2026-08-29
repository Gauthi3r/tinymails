import { homedir } from "node:os";
import { resolve } from "node:path";

export function resolveDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TINYMAILS_DATA_DIR?.trim();
  return resolve(explicit || homedir(), explicit ? "" : ".tinymails");
}

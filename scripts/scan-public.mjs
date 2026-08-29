import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const skippedDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const credentialNames = new Set([
  ["client", "secret.json"].join("_"),
  ["token", "cache.json"].join("_"),
  "credentials.json",
  "credentials.enc",
  ".encryption_key",
]);
const secretKeys = [
  ["access", "token"].join("_"),
  ["refresh", "token"].join("_"),
  ["client", "secret"].join("_"),
];
const reservedEmailDomains = new Set(["example.com", "example.org", "example.net"]);
const forbiddenNameHashes = new Set([
  "f464d7d71c06e47a535ce441aa202aa717cddeab902a45b0c283aac7a9a090d7",
  "ff5933a0b5aa7c115582675ad24ff0febf7317a8fbacb8a5878660a396ae32c8",
  "56d7bf215f1c4fe5637dab07fdf3b61a2aa4d86d0d0843b68ab1444748a9bfaa",
  "a6397fd87b9f04cf17cc1d13207f2dbd66e0dfe7659474113367387e2127e5fc",
]);
const textExtensions = new Set([
  "",
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

function hash(value) {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

function publicPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

function isPlanningFixture(path) {
  return path.startsWith("docs/superpowers/");
}

function inspectText(contents, path) {
  const findings = [];

  if (secretKeys.some((key) => new RegExp(`(?:["']?${key}["']?\\s*[:=])`, "i").test(contents))) {
    findings.push({ rule: "secret-token", path });
  }

  for (const match of contents.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    if (!reservedEmailDomains.has(match[1].toLowerCase())) {
      findings.push({ rule: "email-address", path });
      break;
    }
  }

  const tokens = contents.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
  if (tokens.some((token) => forbiddenNameHashes.has(hash(token)))) {
    findings.push({ rule: "private-name", path });
  }

  return findings;
}

export async function scanTree(root) {
  const findings = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;

      const path = join(directory, entry.name);
      const displayPath = publicPath(root, path);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (credentialNames.has(entry.name.toLowerCase())) {
        findings.push({ rule: "credential-file", path: displayPath });
      }
      if (entry.name.endsWith(".log") || (extname(entry.name) === ".csv" && !displayPath.includes("/"))) {
        findings.push({ rule: "runtime-file", path: displayPath });
      }
      if (textExtensions.has(extname(entry.name).toLowerCase()) && !isPlanningFixture(displayPath)) {
        const contents = await readFile(path, "utf8");
        findings.push(...inspectText(contents, displayPath));
      }
    }
  }

  await walk(root);
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = await scanTree(process.cwd());
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.rule}: ${finding.path}`);
    }
    process.exitCode = 1;
  }
}

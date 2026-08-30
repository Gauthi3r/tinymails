import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const skippedDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
const credentialNames = new Set([
  ["client", "secret.json"].join("_"),
  ["token", "cache.json"].join("_"),
  "credentials.json",
  "credentials.enc",
  ".encryption_key",
]);
const secretValuePatterns = [
  new RegExp(`${["ya", "29"].join("")}\\.[A-Za-z0-9_-]{20,}`),
  new RegExp(`${["GOC", "SPX"].join("")}-[A-Za-z0-9_-]{20,}`),
  new RegExp(`${["1", "//"].join("")}[A-Za-z0-9_-]{20,}`),
  new RegExp(["-----BEGIN", "PRIVATE KEY-----"].join(" ")),
];
const reservedEmailDomains = new Set(["example.com", "example.org", "example.net"]);
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

function publicPath(root, path) {
  return relative(root, path).split(sep).join("/");
}

// Paths git ignores or excludes cannot be staged without --force, so they are
// not part of the public tree. Outside a git checkout nothing is skipped.
async function gitIgnoredPaths(root) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "ls-files", "--others", "--ignored", "--exclude-standard"],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return new Set(stdout.split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

function inspectText(contents, path, privateTerms) {
  const findings = [];

  if (secretValuePatterns.some((pattern) => pattern.test(contents))) {
    findings.push({ rule: "secret-token", path });
  }

  for (const match of contents.matchAll(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    if (!reservedEmailDomains.has(match[1].toLowerCase())) {
      findings.push({ rule: "email-address", path });
      break;
    }
  }

  const lowerContents = contents.toLowerCase();
  if (privateTerms.some((term) => lowerContents.includes(term.toLowerCase()))) {
    findings.push({ rule: "private-name", path });
  }

  return findings;
}

export async function scanTree(root, { privateTerms = /** @type {string[]} */ ([]) } = {}) {
  const findings = [];
  const ignored = await gitIgnoredPaths(root);

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
      if (ignored.has(displayPath)) continue;

      if (credentialNames.has(entry.name.toLowerCase())) {
        findings.push({ rule: "credential-file", path: displayPath });
      }
      if (entry.name.endsWith(".log") || (extname(entry.name) === ".csv" && !displayPath.includes("/"))) {
        findings.push({ rule: "runtime-file", path: displayPath });
      }
      if (textExtensions.has(extname(entry.name).toLowerCase())) {
        const contents = await readFile(path, "utf8");
        findings.push(...inspectText(contents, displayPath, privateTerms));
      }
    }
  }

  await walk(root);
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const privateTerms = (process.env.TINYMAILS_PRIVATE_TERMS ?? "")
    .split(/[\n,]/)
    .map((term) => term.trim())
    .filter(Boolean);
  const findings = await scanTree(process.cwd(), { privateTerms });
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.rule}: ${finding.path}`);
    }
    process.exitCode = 1;
  }
}

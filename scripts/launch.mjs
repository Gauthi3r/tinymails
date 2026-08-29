import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { browserCommand, parsePort, probeLoopback } from "./launcher-utils.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = parsePort(process.env.TINYMAILS_PORT);
const url = `http://127.0.0.1:${port}`;

const initialState = await probeLoopback(url);
if (initialState === "tinymails") {
  openBrowser(url);
} else if (initialState === "occupied") {
  throw new Error(`Port ${port} is already used by another local service. Set TINYMAILS_PORT to another port.`);
} else {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"]);
  const server = spawn(
    process.execPath,
    ["--import", "tsx", join(root, "src/server/index.ts")],
    { cwd: root, env: process.env, stdio: "inherit" },
  );
  let exited = false;
  server.once("exit", (code) => {
    exited = true;
    process.exitCode = code ?? 1;
  });
  try {
    await waitForTinyMails(url, () => exited);
    openBrowser(url);
  } catch (error) {
    if (!exited) server.kill("SIGTERM");
    throw error;
  }
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      if (!exited) server.kill(signal);
    });
  }
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`TinyMails build failed with exit code ${code ?? "unknown"}.`));
    });
  });
}

async function waitForTinyMails(baseUrl, didExit) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (didExit()) throw new Error("TinyMails stopped before the local server became ready.");
    const state = await probeLoopback(baseUrl);
    if (state === "tinymails") return;
    if (state === "occupied") throw new Error("Another local service claimed the TinyMails port during startup.");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("TinyMails did not become ready within 15 seconds.");
}

function openBrowser(target) {
  if (process.env.TINYMAILS_NO_OPEN === "1") return;
  const { command, args } = browserCommand(process.platform, target);
  const browser = spawn(command, args, { detached: true, stdio: "ignore" });
  browser.once("error", () => undefined);
  browser.unref();
}

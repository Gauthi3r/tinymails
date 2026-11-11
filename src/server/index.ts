import express from "express";
import { recoverInterruptedCampaigns } from "../domain/campaigns";
import { KeyringCredentialVault } from "../gmail/credential-vault";
import { GoogleGmailAdapter } from "../gmail/google-adapter";
import { GoogleAuthLibraryProvider, GoogleOAuthService } from "../gmail/google-oauth";
import { createApp } from "./app";
import { CampaignRunner } from "./campaign-runner";
import { resolveDataDir } from "./data-dir";
import { acquireDataDirectoryLock, type DataDirectoryLock } from "./instance-lock";
import { listenOnLoopback, resolveMcpBridgePath, resolveStaticDirectory } from "./local-server";
import { createRepositories } from "./repositories";

const RESUME_CHECK_MILLISECONDS = 60_000;

try {
  await startServer();
} catch (error) {
  console.error(error instanceof Error ? error.message : "TinyMails could not start.");
  process.exitCode = 1;
}

async function startServer(): Promise<void> {
  const dataDir = resolveDataDir();
  const lock = await acquireDataDirectoryLock(dataDir);
  installLockCleanup(lock);
  try {
    const repositories = createRepositories(dataDir);
    const recovered = recoverInterruptedCampaigns(await repositories.campaigns.list());
    await repositories.campaigns.replaceAll(recovered);

    const port = serverPort(process.env.TINYMAILS_PORT);
    const vault = new KeyringCredentialVault();
    const gmail = new GoogleGmailAdapter({ dataDir, vault });
    const oauth = new GoogleOAuthService({
      dataDir,
      accounts: repositories.accounts,
      vault,
      provider: new GoogleAuthLibraryProvider(),
    });

    const runner = new CampaignRunner({
      campaigns: repositories.campaigns,
      accounts: repositories.accounts,
      suppression: repositories.suppression,
      gmail,
    });
    const app = createApp({
      repositories,
      gmail,
      dataDir,
      oauth,
      oauthRedirectUri: `http://127.0.0.1:${port}/api/oauth/google/callback`,
      runner,
      mcpBridgePath: resolveMcpBridgePath(import.meta.url),
    });
    app.use(express.static(resolveStaticDirectory(import.meta.url)));

    await listenOnLoopback(app, port);
    // A campaign waiting on its daily cap or sending window continues from here.
    setInterval(() => {
      void runner.resumeWaiting().catch((error: unknown) => {
        console.error("TinyMails could not resume waiting campaigns", error);
      });
    }, RESUME_CHECK_MILLISECONDS).unref();
    console.log(`TinyMails is running at http://127.0.0.1:${port}`);
  } catch (error) {
    await lock.release();
    throw error;
  }
}

function installLockCleanup(lock: DataDirectoryLock): void {
  process.once("exit", () => lock.releaseSync());
  process.once("SIGINT", () => {
    lock.releaseSync();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    lock.releaseSync();
    process.exit(143);
  });
}

function serverPort(value: string | undefined): number {
  const candidate = value === undefined ? 3210 : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535) {
    throw new Error("TINYMAILS_PORT must be a number between 1 and 65535.");
  }
  return candidate;
}

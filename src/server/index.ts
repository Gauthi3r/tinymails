import { resolve } from "node:path";
import express from "express";
import { recoverInterruptedCampaigns } from "../domain/campaigns";
import { KeyringCredentialVault } from "../gmail/credential-vault";
import { GoogleGmailAdapter } from "../gmail/google-adapter";
import { GoogleAuthLibraryProvider, GoogleOAuthService } from "../gmail/google-oauth";
import { createApp } from "./app";
import { resolveDataDir } from "./data-dir";
import { createRepositories } from "./repositories";

const dataDir = resolveDataDir();
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

const app = createApp({
  repositories,
  gmail,
  dataDir,
  oauth,
  oauthRedirectUri: `http://127.0.0.1:${port}/api/oauth/google/callback`,
});
const staticDir = resolve(process.cwd(), "dist");
app.use(express.static(staticDir));

app.listen(port, "127.0.0.1", (error?: Error) => {
  if (error) {
    console.error(`TinyMails could not start because port ${port} is unavailable.`);
    return;
  }
  console.log(`TinyMails is running at http://127.0.0.1:${port}`);
});

function serverPort(value: string | undefined): number {
  const candidate = value === undefined ? 3210 : Number(value);
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 65_535) {
    throw new Error("TINYMAILS_PORT must be a number between 1 and 65535.");
  }
  return candidate;
}

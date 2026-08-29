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

const port = Number(process.env.TINYMAILS_PORT ?? 3210);
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

app.listen(port, "127.0.0.1", () => {
  console.log(`TinyMails is running at http://127.0.0.1:${port}`);
});

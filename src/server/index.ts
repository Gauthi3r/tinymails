import { resolve } from "node:path";
import express from "express";
import { recoverInterruptedCampaigns } from "../domain/campaigns";
import type { GmailAccountAdapter } from "../gmail/adapter";
import { createApp } from "./app";
import { resolveDataDir } from "./data-dir";
import { createRepositories } from "./repositories";

const dataDir = resolveDataDir();
const repositories = createRepositories(dataDir);
const recovered = recoverInterruptedCampaigns(await repositories.campaigns.list());
await repositories.campaigns.replaceAll(recovered);

const unavailableGmail: GmailAccountAdapter = {
  async status(account) {
    return { connected: false, email: account.email, message: "Connect this account in Settings." };
  },
  async send() {
    return { ok: false, kind: "auth", message: "Connect this account in Settings." };
  },
  async listInbound() {
    return { messages: [] };
  },
};

const app = createApp({ repositories, gmail: unavailableGmail, dataDir });
const staticDir = resolve(process.cwd(), "dist");
app.use(express.static(staticDir));

const port = Number(process.env.TINYMAILS_PORT ?? 3210);
app.listen(port, "127.0.0.1", () => {
  console.log(`TinyMails is running at http://127.0.0.1:${port}`);
});

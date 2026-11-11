import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Campaign } from "../domain/types";
import { LocalApi } from "./local-api";

export interface OutboxServerOptions {
  /** Where TinyMails is running, for example http://127.0.0.1:3210. */
  baseUrl: string;
  version: string;
  fetcher?: typeof fetch;
}

const recipientSchema = z.object({
  email: z.string().describe("The recipient's email address."),
  firstName: z.string().optional().describe("Fills {firstName}. Without it the email says \"there\"."),
  company: z.string().optional().describe("Fills {company}. Without it the email says \"your company\"."),
});

/**
 * The agent's side of TinyMails: queue a campaign, send the test to the user,
 * watch progress, pause, and add to the do-not-contact list. Starting a send
 * belongs to the person at the TinyMails window, so `start_campaign` exists
 * only when they have switched on "Let agents start campaigns" in Settings.
 */
export async function createOutboxServer(options: OutboxServerOptions): Promise<McpServer> {
  const api = new LocalApi(options.baseUrl, options.fetcher);
  const agentsCanStart = await canStart(api);
  const startStep = agentsCanStart
    ? `Ask the user to read the test in their inbox. Once they approve, call start_campaign, or they can press Start in TinyMails at ${options.baseUrl}.`
    : `Ask the user to read the test in their inbox and press Start in TinyMails at ${options.baseUrl}. You cannot start it for them.`;

  const server = new McpServer(
    { name: "tinymails", title: "TinyMails", version: options.version },
    {
      instructions: [
        "TinyMails is an outbox on the user's computer. It sends email from the user's own Gmail account, one message at a time, under a daily cap and inside the user's sending hours.",
        "To send a campaign: 1. list_accounts. 2. queue_campaign: it arrives paused and nothing is sent. 3. send_test: one email goes to the user's own Gmail address only. 4. Tell the user what was queued and what was excluded.",
        startStep,
        "At the daily cap or outside the sending hours a started campaign waits and continues by itself. Only queue people who expect to hear from the user.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "list_accounts",
    {
      title: "List Gmail accounts",
      description:
        "The Gmail accounts connected to TinyMails, each with its daily cap, delay between emails, time zone and sending hours. Call this first. An empty list means the user must connect Gmail in TinyMails Settings.",
      annotations: { readOnlyHint: true },
    },
    () => answer(async () => ({
      accounts: (await api.accounts()).map((account) => ({
        id: account.id,
        email: account.email,
        dailyCap: account.dailyCap,
        delayMinSeconds: account.delayMinSeconds,
        delayMaxSeconds: account.delayMaxSeconds,
        timeZone: account.timeZone,
        sendingWindow: account.sendingWindow,
      })),
    })),
  );

  server.registerTool(
    "queue_campaign",
    {
      title: "Queue a campaign",
      description:
        "Queue one email to many recipients. The campaign is created paused: nothing is sent. TinyMails refuses invalid, duplicate, do-not-contact and already-queued addresses and lists them under `excluded`. A campaign cannot be edited afterwards.",
      inputSchema: z.object({
        name: z.string().min(1).describe("A short name the user will recognise in TinyMails."),
        subject: z.string().min(1).describe("Subject line. May use {firstName} and {company}."),
        body: z.string().min(1).describe("Plain-text message. May use {firstName} and {company}."),
        recipients: z.array(recipientSchema).min(1).max(2_000),
        accountId: z.string().optional().describe("The Gmail account to send from. Optional when exactly one is connected."),
        dailyCap: z.number().int().min(1).max(500).optional().describe("Emails per day. Defaults to the account's cap, which also stays the upper limit."),
        delayMinSeconds: z.number().int().min(0).max(3_600).optional().describe("Shortest wait between emails. Defaults to the account's."),
        delayMaxSeconds: z.number().int().min(0).max(3_600).optional().describe("Longest wait between emails. Defaults to the account's."),
      }),
    },
    (input) => answer(async () => {
      const accounts = await api.accounts();
      if (accounts.length === 0) {
        throw new Error(`No Gmail account is connected. Ask the user to connect one in TinyMails Settings at ${options.baseUrl}.`);
      }
      const account = input.accountId
        ? accounts.find((candidate) => candidate.id === input.accountId)
        : accounts.length === 1 ? accounts[0] : undefined;
      if (!account) {
        throw new Error(input.accountId
          ? "That Gmail account is not connected. Call list_accounts and use one of its ids."
          : "Several Gmail accounts are connected. Call list_accounts and pass the accountId to send from.");
      }
      const { campaign, excluded } = await api.queueCampaign({
        name: input.name,
        subject: input.subject,
        body: input.body,
        accountIds: [account.id],
        dailyCap: input.dailyCap ?? account.dailyCap,
        delayMinSeconds: input.delayMinSeconds ?? account.delayMinSeconds,
        delayMaxSeconds: input.delayMaxSeconds ?? Math.max(account.delayMaxSeconds, input.delayMinSeconds ?? 0),
        recipients: input.recipients,
      });
      return {
        campaign: summary(campaign),
        sendingFrom: account.email,
        excluded,
        next: "Nothing has been sent. Call send_test so the user can read the email before it goes out.",
      };
    }),
  );

  server.registerTool(
    "send_test",
    {
      title: "Send the test to the user",
      description:
        "Send the campaign's real email, personalised for one of its recipients, to the user's own Gmail address. Nothing goes to a recipient. A campaign cannot be started until its test has been sent.",
      inputSchema: z.object({ campaignId: z.string() }),
    },
    ({ campaignId }) => answer(async () => ({
      campaign: summary(await api.sendTest(campaignId)),
      next: startStep,
    })),
  );

  server.registerTool(
    "get_campaigns",
    {
      title: "Check campaigns",
      description:
        "Progress of every campaign: status (paused, running, done or stopped), why it is paused or waiting, when it resumes, and counts per recipient status. Pass campaignId for one campaign with its message and each recipient's result.",
      inputSchema: z.object({ campaignId: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ campaignId }) => answer(async () => {
      const campaigns = await api.campaigns();
      if (!campaignId) return { campaigns: campaigns.map(summary) };
      const campaign = campaigns.find((candidate) => candidate.id === campaignId);
      if (!campaign) throw new Error("Campaign not found.");
      return {
        campaign: {
          ...summary(campaign),
          subject: campaign.subject,
          body: campaign.body,
          recipients: campaign.recipients.map((recipient) => ({
            email: recipient.email,
            status: recipient.status,
            ...(recipient.sentAt ? { sentAt: recipient.sentAt } : {}),
            ...(recipient.error ? { note: recipient.error } : {}),
          })),
        },
      };
    }),
  );

  server.registerTool(
    "pause_campaign",
    {
      title: "Pause a campaign",
      description: "Pause a running campaign. It stays paused until the user presses Start again.",
      inputSchema: z.object({ campaignId: z.string() }),
    },
    ({ campaignId }) => answer(async () => ({ campaign: summary(await api.pause(campaignId)) })),
  );

  server.registerTool(
    "add_do_not_contact",
    {
      title: "Add to the do-not-contact list",
      description:
        "Add addresses TinyMails must never email again. It applies at once, including to campaigns that are already running. Addresses cannot be removed through this connection.",
      inputSchema: z.object({ emails: z.array(z.string()).min(1).max(2_000) }),
    },
    ({ emails }) => answer(async () => ({ doNotContactCount: (await api.addDoNotContact(emails)).length })),
  );

  if (agentsCanStart) {
    server.registerTool(
      "start_campaign",
      {
        title: "Start a campaign",
        description:
          "Start sending a tested campaign. Real emails go out. Call it only after the user has read the test and told you to start. Available because the user switched on \"Let agents start campaigns\".",
        inputSchema: z.object({ campaignId: z.string() }),
      },
      ({ campaignId }) => answer(async () => {
        // Checked again here: the user may have switched the setting off since this agent connected.
        if (!(await canStart(api))) {
          throw new Error(`Starting is switched off. Ask the user to press Start in TinyMails at ${options.baseUrl}.`);
        }
        return { campaign: summary(await api.start(campaignId)) };
      }),
    );
  }

  return server;
}

async function canStart(api: LocalApi): Promise<boolean> {
  try {
    return (await api.settings()).agentsCanStart === true;
  } catch {
    return false;
  }
}

function summary(campaign: Campaign) {
  const count = (status: Campaign["recipients"][number]["status"]) =>
    campaign.recipients.filter((recipient) => recipient.status === status).length;
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    ...(campaign.status === "paused" && campaign.pauseReason ? { pauseReason: campaign.pauseReason } : {}),
    ...(campaign.status === "running" && campaign.waitingReason ? { waitingReason: campaign.waitingReason } : {}),
    ...(campaign.status === "running" && campaign.resumesAt ? { resumesAt: campaign.resumesAt } : {}),
    tested: Boolean(campaign.testedAt),
    dailyCap: campaign.dailyCap,
    counts: {
      total: campaign.recipients.length,
      pending: count("pending") + count("sending"),
      sent: count("sent"),
      failed: count("failed"),
      skipped: count("skipped"),
      notSent: count("not-sent"),
    },
  };
}

async function answer(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await work(), null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "TinyMails could not complete that request.";
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

import { renderMessage, withoutWait } from "./product";
import type { DemoWorld } from "./world";

export type ControllerResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

// TinyMails' Start gate lives in its Express layer (src/server/app.ts), which
// does not run in a browser. This re-implements only that gate, with the
// server's own error strings where it has them:
// - the test must be sent before Start;
// - only a paused campaign can start (the demo's stricter reading);
// - only a running campaign can pause.
export class DemoController {
  constructor(private readonly world: DemoWorld) {}

  async sendTest(): Promise<ControllerResult<{ to: string; subject: string }>> {
    const { world } = this;
    const campaign = await world.campaigns.get(world.campaignId);
    if (!campaign) return { ok: false, error: "Campaign not found." };
    if (campaign.status !== "paused") {
      return { ok: false, error: "Only a paused campaign can send a preview." };
    }
    const account = await world.accounts.get(world.account.id);
    if (!account) return { ok: false, error: "Reconnect every assigned Gmail account before testing." };
    const recipient = campaign.recipients.find((item) => item.accountId === account.id)
      ?? campaign.recipients[0];
    const message = {
      to: account.email,
      subject: renderMessage(campaign.subject, recipient),
      body: renderMessage(campaign.body, recipient),
    };
    const result = await world.gmail.send(account, message);
    if (!result.ok) return { ok: false, error: result.message };
    await world.campaigns.update(world.campaignId, (record) => ({ ...record, testedAt: world.iso() }));
    return { ok: true, to: message.to, subject: message.subject };
  }

  async start(): Promise<ControllerResult<{ run: Promise<void> }>> {
    const { world } = this;
    const campaign = await world.campaigns.get(world.campaignId);
    if (!campaign) return { ok: false, error: "Campaign not found." };
    if (!campaign.testedAt) {
      return { ok: false, error: "Send this campaign's personalized preview before starting." };
    }
    if (campaign.status !== "paused") {
      return { ok: false, error: "Only a paused campaign can be started." };
    }
    await world.campaigns.update(world.campaignId, (record) => ({
      ...record,
      status: "running",
      pauseReason: undefined,
    }));
    return { ok: true, run: world.runner.run(world.campaignId) };
  }

  async pause(): Promise<ControllerResult> {
    const { world } = this;
    const campaign = await world.campaigns.get(world.campaignId);
    if (!campaign) return { ok: false, error: "Campaign not found." };
    if (campaign.status !== "running") {
      return { ok: false, error: "Only a running campaign can be paused." };
    }
    await world.campaigns.update(world.campaignId, (record) => ({
      ...withoutWait(record),
      status: "paused",
      pauseReason: "Paused manually.",
    }));
    return { ok: true };
  }
}

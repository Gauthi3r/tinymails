import { DemoController } from "./controller";
import { CAP_WAIT_REASON, WINDOW_WAIT_REASON, type Campaign } from "./product";
import { shortDayAndTime } from "./time";
import { DemoWorld, type WorldOptions } from "./world";

export const CAP_REASON = CAP_WAIT_REASON;
export const WINDOW_REASON = WINDOW_WAIT_REASON;
export const MANUAL_REASON = "Paused manually.";

export type Phase = "untested" | "ready" | "running" | "paused" | "waiting" | "done";

export interface SessionState {
  phase: Phase;
  status: string;
  sent: number;
  queued: number;
  now: number;
  campaign: Campaign;
}

/**
 * The hero's demo: one world, the visitor's three buttons, and the honest
 * status line. At the cap or outside the window the product's runner leaves
 * the campaign running and waiting, with the time it may send again.
 * `continueWaiting` does what the app's once-a-minute timer does once that
 * time comes: the clock moves there and the runner carries on, with no
 * second press of Start.
 */
export class DemoSession {
  readonly world: DemoWorld;
  readonly controller: DemoController;
  private tested = false;
  private everStarted = false;
  private readonly listeners = new Set<(state: SessionState) => void>();
  private disposed = false;

  constructor(options: WorldOptions = {}) {
    this.world = new DemoWorld(options);
    this.controller = new DemoController(this.world);
    this.world.campaigns.subscribe(() => this.emit());
  }

  state(): SessionState {
    const campaign = this.world.campaign();
    const sent = campaign.recipients.filter((recipient) => recipient.status === "sent").length;
    const phase = this.phase(campaign);
    return {
      phase,
      status: this.statusLine(phase, campaign, sent),
      sent,
      queued: campaign.recipients.length,
      now: this.world.now,
      campaign,
    };
  }

  subscribe(listener: (state: SessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async sendTest() {
    const result = await this.controller.sendTest();
    if (result.ok) this.tested = true;
    this.emit();
    return result;
  }

  /** Resolves when the runner returns: waiting at a limit, paused, or done. */
  async start() {
    const result = await this.controller.start();
    if (!result.ok) return result;
    this.everStarted = true;
    this.emit();
    await result.run;
    this.emit();
    return result;
  }

  /**
   * While the campaign waits, move the clock to its own `resumesAt` and call
   * the runner's `resumeWaiting`, as the app's timer does, until it is no
   * longer waiting. Does nothing for a paused or finished campaign.
   */
  async continueWaiting(): Promise<void> {
    for (let round = 0; round < 30 && !this.disposed; round += 1) {
      const campaign = this.world.campaign();
      if (campaign.status !== "running" || !campaign.waitingReason || !campaign.resumesAt) break;
      this.world.now = Math.max(this.world.now, Date.parse(campaign.resumesAt));
      this.emit();
      await this.world.runner.resumeWaiting();
    }
    this.emit();
  }

  async pause() {
    const result = await this.controller.pause();
    this.emit();
    return result;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private phase(campaign: Campaign): Phase {
    if (campaign.status === "done") return "done";
    if (campaign.status === "running") return campaign.waitingReason ? "waiting" : "running";
    if (!this.tested) return "untested";
    if (!this.everStarted) return "ready";
    return "paused";
  }

  private statusLine(phase: Phase, campaign: Campaign, sent: number): string {
    switch (phase) {
      case "untested":
        return "Start unlocks after the test.";
      case "ready":
        return `Test sent to ${this.world.account.email}.`;
      case "running":
        return "Sending, one message at a time.";
      case "done":
        return `Done. ${sent} sent.`;
      case "waiting":
        return waitingLine(campaign);
      case "paused":
        return campaign.pauseReason ?? MANUAL_REASON;
    }
  }

  private emit(): void {
    if (this.disposed) return;
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}

/** The app's waiting line (src/app/CampaignsPage.tsx), in the demo's UTC clock. */
export function waitingLine(campaign: Campaign): string {
  if (!campaign.resumesAt) return campaign.waitingReason ?? "";
  return `${campaign.waitingReason} It continues on its own, ${shortDayAndTime(Date.parse(campaign.resumesAt))}.`;
}

import { DemoController } from "./controller";
import type { Campaign } from "./product";
import { dayAndTime, nextOpening } from "./time";
import { DemoWorld, type WorldOptions } from "./world";

export const CAP_REASON = "The Gmail account's daily cap has been reached.";
export const WINDOW_REASON = "Outside the Gmail account's sending window.";
export const MANUAL_REASON = "Paused manually.";

export type Phase = "untested" | "ready" | "running" | "paused" | "waiting" | "done";

export interface SessionState {
  phase: Phase;
  status: string;
  sent: number;
  queued: number;
  now: number;
  /** Set once, when the clock has rolled to the next window opening. */
  rolled?: { from: number; to: number };
  campaign: Campaign;
}

/**
 * The hero's demo: one world, the visitor's three buttons, and the honest
 * status line. After the runner pauses at the cap or the window, the demo
 * clock moves to the next window opening and waits for the human. It never
 * presses Start by itself, because TinyMails does not.
 */
export class DemoSession {
  readonly world: DemoWorld;
  readonly controller: DemoController;
  private tested = false;
  private everStarted = false;
  private rolled?: { from: number; to: number };
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
      rolled: this.rolled,
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

  /** Resolves when this press of Start has settled: paused, done, or handed over. */
  async start() {
    const result = await this.controller.start();
    if (!result.ok) return result;
    this.everStarted = true;
    this.rolled = undefined;
    this.emit();
    await result.run;
    this.settle();
    return result;
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

  private settle(): void {
    if (this.disposed) return;
    const campaign = this.world.campaign();
    const reason = campaign.pauseReason;
    if (campaign.status === "paused" && (reason === CAP_REASON || reason === WINDOW_REASON) && !this.rolled) {
      const from = this.world.now;
      const to = nextOpening(this.world.rules, from, false);
      this.world.now = to;
      this.rolled = { from, to };
    }
    this.emit();
  }

  private phase(campaign: Campaign): Phase {
    if (campaign.status === "done") return "done";
    if (campaign.status === "running") return "running";
    if (!this.tested) return "untested";
    if (!this.everStarted) return "ready";
    return this.rolled ? "waiting" : "paused";
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
        return `${campaign.pauseReason} It is now ${dayAndTime(this.world.now)}. Press Start to continue.`;
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

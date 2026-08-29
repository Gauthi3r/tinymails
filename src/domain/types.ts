export type RecipientStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "skipped"
  | "not-sent";
export type CampaignStatus = "running" | "paused" | "done" | "stopped";
export type GmailCapability = "send" | "inbox-tracking";
export type LeadStatus =
  | "new"
  | "queued"
  | "contacted"
  | "replied"
  | "bounced"
  | "do-not-contact";

export interface SendingWindow {
  days: number[];
  start: string;
  end: string;
}

export interface Account {
  id: string;
  email: string;
  label: string;
  capabilities: GmailCapability[];
  dailyCap: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  timeZone: string;
  sendingWindow: SendingWindow;
  credentialDirectory: string;
  lastTestedAt?: string;
}

export interface ContactInput {
  email: string;
  firstName?: string;
  company?: string;
}

export interface Lead extends ContactInput {
  source: string;
  addedAt: string;
}

export interface Recipient extends ContactInput {
  accountId: string;
  status: RecipientStatus;
  messageId?: string;
  sentAt?: string;
  failedAt?: string;
  error?: string;
  repliedAt?: string;
  bouncedAt?: string;
}

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  body: string;
  accountIds: string[];
  dailyCap: number;
  delayMinSeconds: number;
  delayMaxSeconds: number;
  createdAt: string;
  testedAt?: string;
  status: CampaignStatus;
  recipients: Recipient[];
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface Reply {
  id: string;
  accountId: string;
  campaignId?: string;
  email: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  kind: "reply" | "bounce";
}

export interface OutgoingMessage {
  to: string;
  subject: string;
  body: string;
}

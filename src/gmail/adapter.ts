import type { Account, OutgoingMessage } from "../domain/types";

export interface AccountStatus {
  connected: boolean;
  email: string;
  message?: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; kind: "auth" | "temporary" | "permanent"; message: string };

export interface InboxCursor {
  value: string;
}

export interface InboundMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  receivedAt: string;
}

export interface InboundResult {
  messages: InboundMessage[];
  cursor?: InboxCursor;
}

export interface GmailAccountAdapter {
  status(account: Account): Promise<AccountStatus>;
  send(account: Account, message: OutgoingMessage): Promise<SendResult>;
  listInbound(account: Account, cursor?: InboxCursor): Promise<InboundResult>;
}

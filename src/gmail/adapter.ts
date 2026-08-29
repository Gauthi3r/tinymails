import type { Account, OutgoingMessage } from "../domain/types";

export interface AccountStatus {
  connected: boolean;
  email: string;
  message?: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; kind: "auth" | "temporary" | "permanent"; message: string };

export interface GmailAccountAdapter {
  status(account: Account): Promise<AccountStatus>;
  send(account: Account, message: OutgoingMessage): Promise<SendResult>;
}

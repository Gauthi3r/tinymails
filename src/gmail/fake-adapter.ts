import type { Account, OutgoingMessage } from "../domain/types";
import type {
  AccountStatus,
  GmailAccountAdapter,
  InboxCursor,
  InboundResult,
  SendResult,
} from "./adapter";

export class FakeGmailAccountAdapter implements GmailAccountAdapter {
  readonly sent: Array<{ accountId: string; message: OutgoingMessage }> = [];
  private readonly queuedResults: Array<SendResult | Error> = [];

  queueResult(result: SendResult): void {
    this.queuedResults.push(result);
  }

  queueError(error: Error): void {
    this.queuedResults.push(error);
  }

  async status(account: Account): Promise<AccountStatus> {
    return { connected: true, email: account.email };
  }

  async send(account: Account, message: OutgoingMessage): Promise<SendResult> {
    const result = this.queuedResults.shift() ?? {
      ok: true,
      messageId: `fake-message-${this.sent.length + 1}`,
    };
    if (result instanceof Error) throw result;
    if (result.ok) this.sent.push({ accountId: account.id, message: structuredClone(message) });
    return result;
  }

  async listInbound(_account: Account, cursor?: InboxCursor): Promise<InboundResult> {
    return { messages: [], ...(cursor ? { cursor } : {}) };
  }
}

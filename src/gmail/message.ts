import { normalizeEmail } from "../domain/email";
import type { OutgoingMessage } from "../domain/types";

export class GmailMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GmailMessageError";
  }
}

export function createRawGmailMessage(message: OutgoingMessage): string {
  if (containsLineBreak(message.to) || containsLineBreak(message.subject)) {
    throw new GmailMessageError("Message headers contain invalid characters.");
  }
  const to = normalizeEmail(message.to);
  if (!to) throw new GmailMessageError("The recipient email address is invalid.");

  const headers = [
    `To: ${to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  const body = message.body.replace(/\r\n|\r|\n/g, "\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function containsLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

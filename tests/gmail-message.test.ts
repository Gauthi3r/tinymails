import { describe, expect, it } from "vitest";
import { GmailMessageError, createRawGmailMessage } from "../src/gmail/message";

describe("Gmail message encoding", () => {
  it("creates a base64url RFC message with an encoded Unicode subject", () => {
    const encoded = createRawGmailMessage({
      to: "person@example.com",
      subject: "Hello, Zoë 👋",
      body: "Hi Zoë,\n\nA short note.",
    });
    const raw = Buffer.from(encoded, "base64url").toString("utf8");

    expect(raw).toContain("To: person@example.com\r\n");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("Hello, Zoë 👋").toString("base64")}?=\r\n`);
    expect(raw).toContain("Content-Type: text/plain; charset=UTF-8\r\n");
    expect(raw).toContain("\r\n\r\nHi Zoë,\r\n\r\nA short note.");
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it.each([
    { to: "person@example.com\r\nBcc: hidden@example.org", subject: "Hello" },
    { to: "person@example.com", subject: "Hello\nBcc: hidden@example.org" },
  ])("rejects header injection", ({ to, subject }) => {
    expect(() => createRawGmailMessage({ to, subject, body: "Body" })).toThrowError(
      new GmailMessageError("Message headers contain invalid characters."),
    );
  });
});

import { describe, expect, it } from "vitest";
import { browserCommand, parsePort, probeLoopback } from "../scripts/launcher-utils.mjs";

describe("local launcher", () => {
  it("accepts a valid loopback port and rejects invalid values", () => {
    expect(parsePort(undefined)).toBe(3210);
    expect(parsePort("4310")).toBe(4310);
    expect(() => parsePort("0")).toThrow("TINYMAILS_PORT must be a number between 1 and 65535.");
    expect(() => parsePort("not-a-port")).toThrow("TINYMAILS_PORT must be a number between 1 and 65535.");
  });

  it("builds platform-specific browser commands without a shell", () => {
    const url = "http://127.0.0.1:3210";
    expect(browserCommand("darwin", url)).toEqual({ command: "open", args: [url] });
    expect(browserCommand("linux", url)).toEqual({ command: "xdg-open", args: [url] });
    expect(browserCommand("win32", url)).toEqual({
      command: "cmd",
      args: ["/d", "/s", "/c", "start", "", url],
    });
  });

  it("distinguishes TinyMails from another service using the same port", async () => {
    const tinyMailsFetch = async () => new Response(JSON.stringify({ ok: true, product: "TinyMails" }), { status: 200 });
    const otherServiceFetch = async () => new Response("Not found", { status: 404 });
    const refusedFetch = async () => { throw new Error("Connection refused"); };

    await expect(probeLoopback("http://127.0.0.1:3210", tinyMailsFetch)).resolves.toBe("tinymails");
    await expect(probeLoopback("http://127.0.0.1:3210", otherServiceFetch)).resolves.toBe("occupied");
    await expect(probeLoopback("http://127.0.0.1:3210", refusedFetch)).resolves.toBe("free");
  });
});

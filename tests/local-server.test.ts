import express from "express";
import type { Server } from "node:http";
import { fileURLToPath } from "node:url";
import { listenOnLoopback, resolveStaticDirectory } from "../src/server/local-server";
import { describe, expect, it } from "vitest";

describe("local server startup", () => {
  it("rejects with a bounded error when the requested port is occupied", async () => {
    const first = await listenOnLoopback(express(), 0);
    const address = first.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");

    await expect(listenOnLoopback(express(), address.port)).rejects.toThrow(
      `TinyMails could not start because port ${address.port} is unavailable.`,
    );

    await closeServer(first);
  });

  it("resolves production assets from the project containing the server module", () => {
    const moduleUrl = new URL("../src/server/index.ts", import.meta.url).href;

    expect(resolveStaticDirectory(moduleUrl)).toBe(fileURLToPath(new URL("../dist", import.meta.url)));
  });
});

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => error ? reject(error) : resolveClose());
  });
}

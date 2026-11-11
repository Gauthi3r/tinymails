import type { Express } from "express";
import type { Server } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function listenOnLoopback(app: Express, port: number): Promise<Server> {
  return new Promise((resolveServer, reject) => {
    const server = app.listen(port, "127.0.0.1");
    const onListening = () => {
      server.off("error", onError);
      resolveServer(server);
    };
    const onError = (error: NodeJS.ErrnoException) => {
      server.off("listening", onListening);
      if (error.code === "EADDRINUSE") {
        reject(new Error(`TinyMails could not start because port ${port} is unavailable.`));
        return;
      }
      reject(error);
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
}

export function resolveStaticDirectory(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../..", "dist");
}

export function resolveMcpBridgePath(moduleUrl: string): string {
  return resolve(dirname(fileURLToPath(moduleUrl)), "../..", "scripts", "mcp.mjs");
}

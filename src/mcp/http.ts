import { createMcpHandler, type McpHttpHandler } from "@modelcontextprotocol/server";
import type { Express, NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { createOutboxServer } from "./server";

/**
 * Serves the MCP tools at /mcp on the same loopback server as the app, so an
 * agent connects with one URL and nothing extra runs. Mount it after the
 * local request guard and the JSON body parser.
 */
export function mountMcp(app: Express, version: string): void {
  const handlers = new Map<number, McpHttpHandler>();

  app.all("/mcp", (request: ExpressRequest, response: ExpressResponse, next: NextFunction) => {
    // The tools call back into this same server. Its real port is used, never the Host header.
    const port = request.socket.localPort;
    if (!port) {
      next(new Error("TinyMails could not read its own port."));
      return;
    }
    let handler = handlers.get(port);
    if (!handler) {
      const baseUrl = `http://127.0.0.1:${port}`;
      handler = createMcpHandler(() => createOutboxServer({ baseUrl, version }));
      handlers.set(port, handler);
    }
    void serve(handler, request, response).catch((error: unknown) => {
      // An agent closing a streamed answer early is normal, and a started response cannot become an error page.
      if (response.headersSent || response.destroyed) {
        response.destroy();
        return;
      }
      next(error);
    });
  });
}

async function serve(handler: McpHttpHandler, request: ExpressRequest, response: ExpressResponse): Promise<void> {
  const disconnected = new AbortController();
  response.once("close", () => disconnected.abort());

  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined;
  const answer = await handler.fetch(
    new Request(`http://${request.get("host")}${request.originalUrl}`, {
      method: request.method,
      headers,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      signal: disconnected.signal,
    }),
    hasBody ? { parsedBody: request.body } : undefined,
  );

  response.status(answer.status);
  answer.headers.forEach((value, name) => response.setHeader(name, value));
  if (!answer.body) {
    response.end();
    return;
  }
  await pipeline(Readable.fromWeb(answer.body as NodeReadableStream), response);
}

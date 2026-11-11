import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { APP_VERSION } from "../version";
import { createOutboxServer } from "./server";

// For agents that start a command instead of opening a URL (Claude Desktop,
// for one). It holds no data of its own: every tool calls the TinyMails that
// is already running on this computer, so `npm start` must be up.
const port = process.env.TINYMAILS_PORT ?? "3210";

serveStdio(() => createOutboxServer({ baseUrl: `http://127.0.0.1:${port}`, version: APP_VERSION }), {
  onerror: (error) => console.error(`TinyMails MCP: ${error.message}`),
});

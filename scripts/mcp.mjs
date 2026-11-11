// The command an MCP client runs to reach TinyMails over stdio:
//   node /path/to/tinymails/scripts/mcp.mjs
// It resolves everything from this file, so the client's working directory does not matter.
import { register } from "tsx/esm/api";

register();
await import("../src/mcp/stdio.ts");

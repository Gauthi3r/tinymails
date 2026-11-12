# TinyMails v0.2: an outbox for agents

Date: 2026-11-11
Status: Shipped-scope record

## What changed

TinyMails v0.1 was a mail merge a person drove through its screens. v0.2 keeps those screens and adds the reason the project exists now: an AI agent can prepare a send, and TinyMails sends it slowly and safely from the user's own Gmail.

Two decisions in the v0.1 record are replaced:

- "No MCP dependency" becomes: TinyMails serves MCP itself.
- "A campaign pauses at its limits" becomes: a campaign waits at its limits and continues by itself.

## The MCP connection

- The running app serves MCP at `/mcp` on the same loopback server, behind the same Host and Origin guard as the rest of the API. `scripts/mcp.mjs` offers the same tools over stdio for agents that start a command.
- The tools are a thin client of the local HTTP API (`src/mcp/local-api.ts`). There is no second path into sending: caps, sending hours, suppression, duplicate checks, and the test-before-start rule live behind those routes and apply to an agent as they do to the screens. Adding a tool is one function in `src/mcp/server.ts`.
- The stdio bridge holds no data. Only one process may own a data directory, so the bridge calls the running app instead of opening the files itself.
- A new instance is built per request. Nothing about an agent is remembered between calls.

## Start stays with the person

An agent can queue, send the test to the user, read progress, pause, and add to the do-not-contact list. Those are either harmless or move toward sending less.

Starting is different: real email leaves, and it cannot be recalled. So the MCP connection has no start tool unless the user switches on "Let agents start campaigns" in Settings. It is off by default, the tool is absent rather than refusing, and the tool re-reads the setting on every call so switching it off takes effect at once.

This is a rule of the MCP connection, not a wall around the computer. The local API cannot tell which local program is calling it, so an agent with shell access can reach it directly, as any program the user runs can. The README says so. A real barrier would need a secret the agent cannot read, which a local single-user app cannot honestly promise.

## Waiting instead of pausing

"Paused" now means one thing: the campaign needs the user. A manual pause, an expired Gmail sign-in, a temporary Gmail error, and an unknown delivery result still pause.

Reaching the daily cap or the end of the sending window is not a problem to fix, so the campaign stays running. It records `waitingReason` and `resumesAt`, the runner returns, and a one-minute timer in the server calls `resumeWaiting()`, which picks the campaign up once the account may send again. A timer was chosen over one long sleep because it survives the computer sleeping and picks up changed account settings.

The cap counts per calendar day in the account's time zone, as it did in v0.1. With sending hours that cross midnight, a waiting campaign therefore continues at midnight: one day's cap can go out before it and the next day's after it. Gmail measures its own limits over a rolling 24 hours, so an account with all-day sending hours should keep a cap well under half of Gmail's limit. The default hours, Monday to Friday 09:00 to 17:00, are not affected.

`resumesAt` is found by walking forward a minute at a time in the account's time zone (`src/domain/schedule.ts`). That is slower than arithmetic and immune to daylight-saving and overnight-window mistakes.

## Restart still pauses

A campaign that was running when TinyMails stopped comes back paused, with the reason shown. Opening the app days later should never send by surprise, and a paused campaign costs one click. This is the conservative half of "the queue resumes on its own": it resumes for as long as the app runs.

## Not included

- Editing or deleting campaigns over MCP, removing do-not-contact entries, or changing account limits.
- Per-recipient custom fields beyond `{firstName}` and `{company}`.
- Remote or cloud access. The endpoint is loopback-only by design.

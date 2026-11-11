# TinyMails for agents

TinyMails is a local Gmail outbox. It runs on the user's computer, sends from their own Gmail account one message at a time, and serves an MCP server for agents on that same computer. You queue a campaign and send the user a test. The user reads it and presses Start.

This guide describes TinyMails v0.2.0.

## Your job, and where it ends

1. `list_accounts`: find the Gmail account to send from.
2. `queue_campaign`: the campaign arrives paused. Nothing is sent.
3. `send_test`: the real email goes to the user's own Gmail address only.
4. Report what was queued, what was excluded, and that the test is in their inbox.
5. Stop.

The user reads the test and presses Start in TinyMails at `http://127.0.0.1:3210`. Over MCP there is no start tool unless the user switches on "Let agents start campaigns" in TinyMails Settings. It is off by default. Even when it is on, start only after the user has read the test and told you to.

## Before you start

- TinyMails must be running. Check with `curl -s http://127.0.0.1:3210/api/health`. A running copy answers `{"ok":true,"product":"TinyMails","version":"0.2.0"}`.
- If it is not installed: `git clone https://github.com/Gauthi3r/tinymails.git`, `cd tinymails`, `npm install`, `npm start`. It needs Node.js 22 or newer. `npm start` opens a browser window; set `TINYMAILS_NO_OPEN=1` to skip that.
- A Gmail account must be connected. If `list_accounts` returns none, stop and ask the user to connect one in Settings. That step needs a Google OAuth client the user creates once; the README explains it. You cannot do it for them.
- You must be on the same computer. TinyMails only answers on `127.0.0.1` and `localhost`. Agents that run in the cloud cannot reach it.

## Connect over MCP

While TinyMails runs, its MCP server is at:

```
http://127.0.0.1:3210/mcp
```

It uses the Streamable HTTP transport. In Claude Code:

```bash
claude mcp add --transport http tinymails http://127.0.0.1:3210/mcp
```

For an agent that starts a command instead of opening an address, use the stdio bridge in the TinyMails folder. It talks to the running app, so `npm start` must be up:

```bash
node /path/to/tinymails/scripts/mcp.mjs
```

TinyMails Settings shows the address and the command, ready to copy. If TinyMails runs on another port, set `TINYMAILS_PORT` for the bridge.

## The tools

| Tool | What it does |
| --- | --- |
| `list_accounts` | The connected Gmail accounts, each with its `id`, `email`, `dailyCap`, `delayMinSeconds`, `delayMaxSeconds`, `timeZone` and `sendingWindow`. Call it first. |
| `queue_campaign` | Queues one email to many recipients. Inputs: `name`, `subject`, `body`, `recipients` (`email`, optional `firstName` and `company`), and optional `accountId`, `dailyCap`, `delayMinSeconds`, `delayMaxSeconds`. The campaign arrives paused. |
| `send_test` | Takes `campaignId`. Sends the campaign's real email, personalised for one recipient, to the user's own Gmail address. Nothing goes to a recipient. Start stays locked until this has run. |
| `get_campaigns` | Progress of every campaign, or of one with `campaignId`, including each recipient's result. |
| `pause_campaign` | Takes `campaignId`. Pauses a running campaign until the user presses Start again. |
| `add_do_not_contact` | Takes `emails`. TinyMails never emails them again, including in campaigns already running. Addresses cannot be removed this way. |
| `start_campaign` | Only listed when the user has switched on "Let agents start campaigns". Takes `campaignId`. |

Notes on `queue_campaign`:

- `accountId` can be left out when exactly one account is connected. With several, ask the user which one and pass its `id`.
- `dailyCap` and the delays default to the account's own numbers. The account's cap stays the upper limit.
- The body is plain text. Two placeholders exist: `{firstName}` and `{company}`. A contact without a first name gets "there"; one without a company gets "your company".
- Pass every contact as it is. `excluded` lists each address TinyMails refused, with one of four reasons: `invalid`, `duplicate`, `do-not-contact` or `queued` (already waiting in another campaign). An address another campaign has already sent to is skipped when its turn comes.
- A campaign cannot be edited after it is created. If the user wants a change, ask them to stop the paused campaign in TinyMails and queue a new one.

A failed tool call returns an error message written for the user. Pass it on as it is.

## Without MCP: the local HTTP API

If your agent cannot use MCP but can run commands on the same computer, the same steps work over the local HTTP API that TinyMails' own screens use. Do not send an `Origin` header.

```bash
curl -s http://127.0.0.1:3210/api/accounts

curl -s -X POST http://127.0.0.1:3210/api/campaigns \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Design partners",
    "subject": "Thanks for joining, {firstName}",
    "body": "Hi {firstName},\n\nThanks for joining the design partner group.",
    "accountIds": ["<account id>"],
    "dailyCap": 25,
    "delayMinSeconds": 30,
    "delayMaxSeconds": 45,
    "recipients": [
      { "email": "ada@example.com", "firstName": "Ada", "company": "Analytical Engines" },
      { "email": "grace@example.org", "firstName": "Grace", "company": "Compiler Studio" }
    ]
  }'

curl -s -X POST http://127.0.0.1:3210/api/campaigns/<campaign id>/test-send

curl -s http://127.0.0.1:3210/api/campaigns

curl -s -X POST http://127.0.0.1:3210/api/campaigns/<campaign id>/pause

curl -s -X POST http://127.0.0.1:3210/api/suppression \
  -H 'Content-Type: application/json' \
  -d '{"emails":["hopper@example.org"]}'
```

Over HTTP, `dailyCap`, `delayMinSeconds` and `delayMaxSeconds` are required: use the account's numbers. Errors are JSON, `{"error":"…"}`. The HTTP API has a start route because the TinyMails window uses it. The "Let agents start campaigns" switch only governs MCP, so over HTTP the boundary is yours to keep: do not call `/api/campaigns/<id>/start` unless the user tells you to in so many words.

## How sending behaves, so you can explain it

- Start stays locked until a test of the campaign has been sent to the user's own Gmail address.
- TinyMails sends one message at a time and waits a random time inside the delay range between messages.
- It only sends inside the account's sending window and up to the daily cap.
- At the cap or outside the window the campaign stays `running` and waits. `waitingReason` says why ("The Gmail account's daily cap has been reached." or "Outside the Gmail account's sending window.") and `resumesAt` says when it may send again. It carries on by itself then; nobody has to press Start.
- A campaign is `paused`, with a `pauseReason`, when the user pauses it, when the Gmail sign-in has expired, or when Gmail reports a temporary error. It goes on only when the user presses Start.
- After TinyMails is restarted, a campaign that was running comes back paused: "TinyMails was restarted. Press Start to continue."
- Campaign statuses are `paused`, `running`, `done` and `stopped`. Recipient statuses are `pending`, `sending`, `sent`, `failed`, `skipped` and `not-sent`.

## What TinyMails does not do

It does not read the inbox, detect replies or bounces, send follow-ups, add tracking pixels or write email copy. It sends plain text only, has no placeholders beyond `{firstName}` and `{company}`, and has no cloud service.

Source: https://github.com/Gauthi3r/tinymails

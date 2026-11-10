# TinyMails for agents

TinyMails is a local Gmail sending tool. It runs on the user's computer and serves a small HTTP API on `http://127.0.0.1:3210`, the same API its own screens use. If you can run commands on that computer, you can queue a campaign for the user. The user reviews it and sends it.

This guide describes TinyMails v0.1.0. Every request below was run against that version.

## Your job, and where it ends

1. Queue the campaign. It is always created paused.
2. Report what was queued and what was excluded.
3. Stop.

The user sends the test email and presses Start in the TinyMails window at `http://127.0.0.1:3210`. Do not call `/api/campaigns/:id/test-send` or `/api/campaigns/:id/start` unless the user tells you to in so many words. TinyMails has no separate agent permission: the API cannot tell you from the user, so this boundary is yours to keep.

## Before you start

- TinyMails must be running. Check with `curl -s http://127.0.0.1:3210/api/health`. A running copy answers `{"ok":true,"product":"TinyMails","version":"0.1.0"}`.
- If it is not installed: `git clone https://github.com/Gauthi3r/tinymails.git`, `cd tinymails`, `npm install`, `npm start`. It needs Node.js 22 or newer. `npm start` opens a browser window; set `TINYMAILS_NO_OPEN=1` to skip that.
- A Gmail account must be connected. `GET /api/accounts` lists them. If the list is empty, stop and ask the user to connect one in Settings. That step needs a Google OAuth client the user creates once; the README explains it. You cannot do it for them.
- You must be on the same computer. The server only answers on `127.0.0.1` and `localhost`. Do not send an `Origin` header.

## Queue a campaign

Find the account to send from:

```bash
curl -s http://127.0.0.1:3210/api/accounts
```

Each account has an `id`, an `email`, a `dailyCap`, `delayMinSeconds`, `delayMaxSeconds`, a `timeZone` and a `sendingWindow`. Use the account's own numbers in the campaign unless the user asks for something stricter.

Create the campaign:

```bash
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
```

The answer has two parts:

```json
{
  "campaign": { "id": "…", "status": "paused", "recipients": [{ "email": "ada@example.com", "status": "pending" }] },
  "excluded": [{ "email": "ada@example.com", "reason": "duplicate" }]
}
```

- `campaign.status` is always `paused`. Nothing has been sent.
- `excluded` lists every address TinyMails refused, with one of four reasons: `invalid`, `duplicate`, `do-not-contact` or `queued` (already waiting in another campaign).
- An address another campaign has already sent to is accepted here and skipped when its turn comes, with the note "Already contacted by another campaign."
- If no recipient is left, the request fails with `No eligible recipients remain after safety checks.`

Rules for the fields:

- `name`, `subject` and `body` are required. The body is plain text.
- Two placeholders exist: `{firstName}` and `{company}`. A contact without a first name gets "there"; one without a company gets "your company".
- `dailyCap` is a whole number from 1 to 500. Delays are in seconds, and the maximum cannot be below the minimum.
- A campaign cannot be edited after it is created. If the user wants a change, ask them to stop the paused campaign in TinyMails and create a new one.

## Useful extras

Save contacts to the user's library (optional; a campaign does not need it):

```bash
curl -s -X POST http://127.0.0.1:3210/api/leads/import \
  -H 'Content-Type: application/json' \
  -d '{"leads":[{"email":"ada@example.com","firstName":"Ada"}],"target":{"listName":"Design partners"}}'
```

`target` takes either `listName` (creates the list if needed) or `listId`, never both. The answer counts `added`, `existing`, `enriched`, `duplicate` and `invalid`.

Add addresses to the do-not-contact list:

```bash
curl -s -X POST http://127.0.0.1:3210/api/suppression \
  -H 'Content-Type: application/json' \
  -d '{"emails":["hopper@example.org"]}'
```

Save a reusable template:

```bash
curl -s -X POST http://127.0.0.1:3210/api/templates \
  -H 'Content-Type: application/json' \
  -d '{"name":"Welcome","subject":"Thanks for joining, {firstName}","body":"Hi {firstName}"}'
```

Read progress at any time:

```bash
curl -s http://127.0.0.1:3210/api/campaigns
```

Each campaign has a `status` (`paused`, `running`, `done` or `stopped`), a `pauseReason` when paused, and a `status` per recipient (`pending`, `sending`, `sent`, `failed`, `skipped` or `not-sent`).

Pause a running campaign if the user asks:

```bash
curl -s -X POST http://127.0.0.1:3210/api/campaigns/<campaign id>/pause
```

## How sending behaves, so you can explain it

- Start stays locked until a test of the campaign has been sent to the user's own Gmail address.
- TinyMails sends one message at a time and waits a random time inside the delay range between messages.
- It only sends inside the account's sending window and stops at the daily cap.
- When it reaches the cap or leaves the window, the campaign pauses and `pauseReason` says why. It does not start again on its own. The user presses Start.
- After TinyMails is restarted, a campaign that was running comes back paused.

## What TinyMails does not do

It does not read the inbox, detect replies or bounces, send follow-ups, add tracking pixels or write email copy. It has no MCP server and no cloud service. Agents that run in the cloud cannot reach it.

## Errors

Errors are JSON: `{"error":"…"}`. The message is written for the user; pass it on as it is.

Source: https://github.com/Gauthi3r/tinymails

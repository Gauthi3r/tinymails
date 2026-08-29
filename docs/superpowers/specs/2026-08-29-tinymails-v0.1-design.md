# TinyMails v0.1 design

Date: 2026-08-29
Status: Approved direction, implementation in progress

## Product definition

TinyMails is a local-first mail merge application for sending personal, small-batch email through Gmail. It is for founders, consultants, community operators, and small teams contacting people who have agreed to hear from them.

TinyMails keeps contact lists, campaign history, templates, suppression data, and Google credentials on the user's computer. It does not host customer data, proxy email through a TinyMails server, insert tracking pixels, or provide newsletter automation.

The initial release is free and open source under AGPL-3.0. The TinyMails name and visual identity remain separate trademarks.

## Product boundaries

Version 0.1 includes:

- Multiple Gmail accounts, configured by the user.
- CSV lead import with duplicate detection and field mapping.
- Lead lists and derived contact status.
- Small-batch campaigns with per-account daily caps and delays.
- `{firstName}` and `{company}` personalization.
- Saved templates and test sends.
- Personalized campaign review before sending.
- Persistent queues that survive restarts.
- Campaign history and recipient-level status.
- Optional reply and bounce detection.
- A global do-not-contact list.
- Local backup and restore.

Version 0.1 does not include:

- Hosted accounts, billing, or team workspaces.
- Tracking pixels, open tracking, or click tracking.
- Automated follow-up sequences.
- AI-written email.
- A newsletter or drag-and-drop HTML editor.
- A TinyMails-managed Google OAuth client.
- Vercel Connect or an MCP dependency.

## Permission and abuse policy

TinyMails must not present itself as a cold-email or lead-blasting tool. First-run onboarding and campaign review state that recipients must have agreed to receive the message or otherwise have a valid relationship with the sender.

The product includes these safeguards:

- A conservative default daily cap of 25 messages per Gmail account.
- A required test send before a campaign can start.
- A required final review showing the exact send count and account.
- Duplicate, bounce, and suppression checks at campaign creation and immediately before each send.
- A visible opt-out line that users can add to templates.
- A one-action path from a reply to the do-not-contact list.
- No feature intended to rotate accounts to bypass Google limits.

## Technical architecture

TinyMails remains a single-user local web application.

- Frontend: React 19, TypeScript, Vite, Tailwind CSS 4, Base UI.
- Design language: selected `oa-design` tokens and source recipes.
- Local server: Node.js and Express, bound only to `127.0.0.1`.
- Gmail adapter: Google's supported Node.js auth library and Gmail REST API, with account-specific client metadata and credentials.
- Secret storage: the operating-system credential vault through the native keyring adapter.
- Persistence: small JSON and text files written atomically in the TinyMails application-data directory.
- Browser communication: local JSON API. Running campaign status may continue with short polling in v0.1.

The browser is not trusted merely because the server runs on loopback. Every request must use a literal `127.0.0.1` or `localhost` Host header. State-changing requests with an Origin header must match that loopback origin. These checks prevent a remote website from reaching the API through DNS rebinding. OAuth state remains a separate, single-use defense for the callback.

No private user data belongs inside the source repository. Runtime data defaults to an operating-system user-data location and can be overridden with `TINYMAILS_DATA_DIR` for development and tests.

The Gmail adapter is isolated behind a small interface:

```ts
interface GmailAccountAdapter {
  status(account: Account): Promise<AccountStatus>
  send(account: Account, message: OutgoingMessage): Promise<SendResult>
  listInbound(account: Account, cursor?: InboxCursor): Promise<InboundResult>
}
```

Campaign, lead, and suppression code depends on this interface rather than importing Google APIs directly. OAuth orchestration uses separate provider and credential-vault ports. Tests use fakes and never contact Gmail.

## Gmail connection

TinyMails uses bring-your-own Google OAuth credentials.

The account setup flow is:

1. Explain that the user needs a Google Cloud project they control.
2. Link directly to the Gmail API, OAuth branding, audience, and credential pages.
3. Explain Internal and External project choices without claiming that setup bypasses Google's policies.
4. Ask the user to create a Desktop OAuth client and download its JSON file.
5. Accept that file through a local file picker.
6. Validate it as a Desktop client and keep it in the account-specific local application-data directory with user-only permissions.
7. Open Google's browser authorization flow with PKCE and a ten-minute state-bound session.
8. Store returned tokens in the operating-system credential vault rather than a JSON data file.
9. Read the verified account email from Google's OpenID user-info endpoint.
10. Confirm the account and send a self-addressed test message.

Capabilities use incremental authorization:

- Send-only accounts request `gmail.send` plus basic identity scopes.
- Enabling reply and bounce tracking upgrades the account to the restricted Gmail scope required by the inbox implementation.
- The UI explains that inbox tracking grants broader access and remains optional.

Each Gmail identity gets an opaque local account ID and its own credentials directory. No account falls back to another account's credentials. If authentication expires during a campaign, TinyMails returns the current recipient to pending, pauses that account's work, and shows a persistent reconnect notice.

## Data model

Runtime data contains:

- `accounts.json`: labels, email addresses, capability flags, caps, sending hours, and credential-directory references.
- `campaigns.json`: campaign settings and per-recipient audit history.
- `leads.json`: imported lead identity and source list only.
- `templates.json`: reusable subject and body copy.
- `suppression.txt`: normalized addresses that must never be contacted.
- `inbox-state.json`: per-account reply-sweep cursors.

Contact status is derived from campaign history and suppression data. It is not copied into each lead record. A failed send does not mark a lead as contacted. A queued recipient cannot be selected by another campaign.

Writes use a temporary file followed by an atomic rename. Backup creates one portable archive containing all non-secret data. Credentials are excluded from backup by default and can only be exported through a separate explicit action if the Gmail adapter supports a safe mechanism.

## Interface design

TinyMails uses the OA product language: a quiet grey stage, white squircle plates, one blue accent, ink-derived neutrals, pill actions, restrained motion, and sentence-case copy.

The app shell has:

- A fixed 56-pixel header with the TinyMails wordmark.
- Account and connection status at the right.
- Primary navigation for Campaigns, Leads, and Replies.
- A Settings entry for Gmail accounts, sending rules, suppression, and data.
- A persistent floating notice for a paused campaign, expired authorization, or disconnected account.

### New campaign

Campaign composition is a dedicated page with four steps:

1. Recipients: choose a lead list or import a file, map fields, and review excluded rows.
2. Write: enter subject and body, insert variables, or load a template.
3. Delivery: choose Gmail accounts, daily caps, delays, and allowed sending hours.
4. Review: inspect personalized samples, missing-value fallbacks, exclusions, duration estimate, and the final recipient count.

Desktop shows a personalized message preview beside the editor. Mobile places it below the editor. Only the current step is editable, but previous steps remain directly reachable.

### Campaigns

The Campaigns page shows active and recent campaigns in a compact list. Each row has status, progress, Gmail account, sent count, reply count, bounce count, and the next action. Opening a campaign shows recipient-level status, errors, the copy used, pause or resume controls, and a clone action.

### Leads

The Leads page combines list management and suppression-aware contact status. Import review shows detected columns, invalid addresses, duplicates, enrichment, and blocked rows before writing anything. Users can search, filter, edit, remove, export, and add selected leads to the do-not-contact list.

### Replies

The Replies page is a work queue. Each reply shows sender, account, campaign, subject, snippet when inbox access permits it, and actions to open Gmail, mark handled, or suppress the address.

### Settings

Settings contains:

- Gmail accounts and capability status.
- Per-account daily caps, delays, time zone, and sending hours.
- Do-not-contact management.
- Backup and restore.
- Local data path and application version.

## Error handling

- Gmail authorization failure pauses affected work without consuming recipients.
- A send failure records a bounded error message and returns the lead to the available pool unless Gmail confirms delivery.
- Invalid CSV rows appear in import review and can be exported for correction.
- An interrupted in-flight recipient becomes failed with an unknown-delivery warning so TinyMails cannot silently send it twice.
- Suppression changes take effect immediately, including during a running campaign.
- The UI uses persistent notices for unresolved states and short-lived toasts for completed events.
- Error copy names the cause and the action available to the user.

## Open-source sanitization

The public repository starts with a clean Git history. Source migration uses an explicit allowlist. It must not copy runtime data, credentials, logs, private CSV files, build output, machine-specific launchers, personal domains, email addresses, or project-specific documentation.

Before the first public commit, an automated scan must fail on:

- Known private product and domain names from the source installation.
- Email addresses outside approved examples such as `you@example.com`.
- OAuth client JSON, access tokens, refresh tokens, encrypted credential stores, or encryption keys.
- Runtime files under `data`, account credential directories, logs, and campaign CSV files.

The repository includes:

- `LICENSE` with AGPL-3.0 text.
- `TRADEMARKS.md` reserving the TinyMails name and identity.
- A public README with a product screenshot, data-locality statement, prerequisites, setup, and policy statement.
- `SECURITY.md`, `CONTRIBUTING.md`, and a code of conduct.
- A safe sample CSV with fictional `example.com` addresses.
- GitHub Actions for build, lint, tests, and the sanitization scan.

## Testing

Automated tests cover the guarantees that protect users:

- An account can never fall back to another account's credentials.
- Duplicate recipients cannot enter two active campaigns.
- Suppressed and bounced addresses are excluded at creation and send time.
- A failed send does not mark a lead as contacted.
- Daily caps count successful sends across campaigns per account.
- Sending hours and time zones pause and resume correctly.
- Restart recovery returns in-flight work to pending.
- Auth expiration pauses without losing or failing the current recipient.
- CSV parsing, mapping, normalization, deduplication, and enrichment.
- Placeholder rendering and fallback values.
- Backup and restore round trips.
- The public-tree sanitization scan.

Tests use temporary directories and a fake Gmail adapter. No test may use a real account or network access.

## Distribution

The first public release supports:

- Clone, install, and run from the GitHub repository.
- A command-line launcher that builds when needed, starts the loopback server, and opens the app.
- An npm executable so `npx tinymails` can become the shortest path once the package name is confirmed and published.

The repository publishes tagged GitHub releases with release notes and checksums. Signed Electron installers are a later distribution project after the local web release has real users. A hosted service is outside v0.1.

## Delivery order

1. Create the clean public repository and sanitization guard.
2. Copy only generic application source and replace hard-coded account configuration.
3. Extract and test the Gmail adapter.
4. Build the bring-your-own OAuth onboarding flow.
5. Add the OA tokens, selected recipes, and new app shell.
6. Rework compose into the four-step campaign flow.
7. Add import review, personalized preview, account settings, lead editing, campaign cloning, and backup.
8. Add public documentation, policy text, tests, and CI.
9. Run the final trace, secret, build, lint, and test checks before the first source release.

## Success criteria

Version 0.1 is ready when a new technical user can clone the repository, connect a Gmail account using a Google project they control, import a safe sample list, send a test, start a capped campaign, restart the app without losing the queue, and export a backup. The repository and its history contain no private source-installation data or names.

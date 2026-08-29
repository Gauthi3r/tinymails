# TinyMails product and first-release implementation plan

**Goal:** Turn the verified local foundation into a usable first public release: connect Gmail, review a CSV import, compose and inspect a campaign, prove the connection with a test message, run or pause delivery, export local data, and start the app with one command.

**Boundary:** Keep Gmail send-only. Reply tracking remains visibly unavailable until there is a separate restricted-scope review. Do not add hosting, billing, tracking pixels, automation sequences, or a managed OAuth client.

## Task 1: CSV import review

- Add a browser-side CSV parser with quoted-field support, normalized column names, explicit row issues, and deterministic duplicate handling.
- Add focused parser tests before implementation.
- Extend `AppApi` with lead import.
- Add an import panel to Leads that previews valid, invalid, and duplicate rows before the user confirms a local write.
- Refresh the lead library and show added, enriched, existing, duplicate, and invalid counts.

## Task 2: Delivery readiness rules

- Record `lastTestedAt` on an account only after Gmail confirms a self-addressed test.
- Refuse campaign start when any assigned account has not passed a test send.
- Validate that selected account IDs exist, campaigns retain at least one eligible recipient, and maximum delay is not below minimum delay.
- Cover every rule in domain or API tests before implementation.

## Task 3: Four-step campaign composer

- Extend `AppApi` with create, start, and pause operations.
- Build a dedicated composer with Recipients, Write, Delivery, and Review steps.
- Select only currently new leads, expose blocked counts, support `{firstName}` and `{company}`, and show personalized subject/body samples.
- Make account identity, tested state, caps, delay, and recipient count explicit in final review.
- Save in paused state; require a separate, explicit Start action.

## Task 4: Campaign operations

- Turn campaign rows into operational records with progress, failures, account, and start/pause controls.
- Show recipient-level outcomes and bounded errors in a campaign detail panel.
- Poll while a campaign is running and preserve the existing restart and ambiguous-delivery safeguards.

## Task 5: Backup and small management improvements

- Add a sanitized JSON backup export containing non-secret local records and suppression addresses.
- Add a Settings download action and explain that Google credentials are excluded.
- Add a one-click do-not-contact action for lead rows and refresh derived status.

## Task 6: Distribution and release verification

- Add `npm start` and a cross-platform local launcher that builds when needed, starts the loopback app, opens the browser, and forwards shutdown signals.
- Keep clone/install/start as the supported first distribution path; document GitHub releases as the initial channel and defer signed desktop installers.
- Update README, product status, and verification records.
- Run the public scanner, lint, all tests, production build, repository-history checks, and an independent code review before declaring the release ready.

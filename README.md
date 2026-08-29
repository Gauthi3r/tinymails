# TinyMails

TinyMails is a local-first Gmail mail merge for small, permission-based campaigns. It keeps contacts, templates, sending history, and account configuration on your computer.

This repository contains the new public foundation. Campaign rules, atomic local storage, the loopback API, and the OA-based app shell work today. Bring-your-own Google OAuth setup and the full campaign composer are the next milestones. TinyMails cannot send through Gmail until that adapter lands.

## What it does

- Imports and enriches contacts without overwriting known values.
- Derives contact status from campaign history and the do-not-contact list.
- Excludes duplicates, bounces, suppressed addresses, and contacts already queued elsewhere.
- Persists campaign state after each send and recovers interrupted recipients to pending.
- Enforces account caps, sending windows, and delays at the Gmail boundary.
- Keeps Gmail access behind an adapter with no network calls in tests.

TinyMails does not insert tracking pixels, host contact data, write email copy with AI, automate follow-ups, or provide a managed OAuth application.

## Requirements

- Node.js 22 or newer
- npm 10 or newer

Gmail support will require a Google Cloud project and Desktop OAuth client that you control. That setup is not part of the current foundation release.

## Run it locally

```bash
git clone <your-repository-url>
cd tinymails
npm install
npm run build
npm run serve
```

Open `http://127.0.0.1:3210`.

For UI development, run the API and Vite in separate terminals:

```bash
npm run serve
npm run dev
```

Vite runs at `http://127.0.0.1:5173` and proxies `/api` requests to the local service.

## Local data

TinyMails stores runtime data in `~/.tinymails` by default. Set `TINYMAILS_DATA_DIR` to use another directory:

```bash
TINYMAILS_DATA_DIR=/path/to/tinymails-data npm run serve
```

Do not point this at the source checkout. The public-tree scanner rejects credential files, token keys, logs, root CSV files, and non-example email addresses.

## Checks

```bash
npm run scan
npm run lint
npm test -- --run
npm run build
```

Run all four with `npm run check`.

## Responsible use

Only contact people who expect to hear from you. Keep lists small, honor removal requests, and stay within Gmail's policies and applicable law. TinyMails includes caps and suppression checks because those rules belong in the sending path, not in a policy page nobody sees.

## Roadmap

The approved [v0.1 design](docs/superpowers/specs/2026-08-29-tinymails-v0.1-design.md) covers:

1. Bring-your-own Google OAuth onboarding and test sends.
2. CSV import review and the four-step campaign composer.
3. Templates, backups, campaign detail, and optional reply tracking.
4. Release packaging and a one-command local launcher.

## License

The source code is licensed under [GNU AGPL-3.0-only](LICENSE). The license does not grant rights to use the TinyMails name or marks for a modified or hosted product. See [TRADEMARKS.md](TRADEMARKS.md).

The OA design recipes used in the interface retain their MIT notice in [NOTICE.md](NOTICE.md).

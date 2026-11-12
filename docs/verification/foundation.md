# Release verification

Verified on 2026-08-30 against the current repository state with Node.js 22.

## Automated evidence

`npm run check`

- Public-tree scanner: passed with no findings.
- Oxlint: passed with no warnings or errors.
- Source and test type-check: passed.
- Vitest: 146 tests passed across 24 files.
- TypeScript project build: passed.
- Vite production build: passed with 2,078 modules transformed.

The tests cover local-request Host and Origin enforcement, single-process data-directory locking, campaign admission and delivery safeguards, sending windows and caps, ambiguous delivery outcomes, list migration and membership, lead pagination and bulk deletion, CSV review, OAuth session isolation, refresh-token-only keyring persistence, local credential removal, backup redaction, and the public-tree scanner.

## Repository checks

The public scanner checks tracked source and documentation for credential artifacts, non-example addresses, runtime data, and token-shaped values. Private migration terms are supplied only through the untracked `TINYMAILS_PRIVATE_TERMS` environment variable when needed; the repository does not publish hashes of those terms.

The repository uses AGPL-3.0-only. Adapted OA interface recipes retain the upstream Voprex Labs MIT notice and full license text in `docs/NOTICE.md`.

## Platform boundary

CI runs the scanner, lint, tests, type-check, and build on Ubuntu, macOS, and Windows. Automated tests use an in-memory credential vault; a real Keychain, Credential Manager, or Secret Service session is still a manual release check because hosted CI cannot safely assert persistence in a user's desktop keyring.

## Known v0.1 limits

TinyMails exports non-secret backup data but does not restore it. It does not read Gmail, detect replies or bounces, selectively erase a contact from campaign history, or ship a managed Google OAuth client. These limits are also stated in the README and design record.

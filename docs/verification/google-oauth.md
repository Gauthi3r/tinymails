# Google OAuth verification

Verified on 2026-08-29 against commit `3c5d16f` with Node.js `v22.17.1` and npm `10.9.2`.

## Automated evidence

`npm run scan && npm run lint && npm test -- --run && npm run build`

- Public-tree scanner: passed with no findings.
- Oxlint: passed with no warnings or errors.
- Vitest: 62 tests passed across 14 files.
- TypeScript project build: passed.
- Vite production build: passed with 2,072 modules transformed.

Focused coverage verifies:

- Desktop-client validation and bounded errors.
- Separate OAuth state and browser session identifiers, PKCE scopes, expiry, and replay rejection.
- Account-specific client directories with `0600` client files.
- Operating-system vault isolation for each account.
- Unicode message encoding and header-injection rejection.
- Gmail success, token refresh, auth, retryable, permanent, and ambiguous network outcomes.
- Loopback callback handling, strict callback-page content security, sanitized session responses, and self-addressed test sends.
- Inline client-file onboarding, file-size limits, connected state, and test-send feedback.

The public scanner and repository checks found no credential artifacts, non-example addresses, runtime data, or private installation names. Browser API responses omit credential directories, OAuth client contents, tokens, authorization codes, and provider error bodies.

## Manual release check

A real authorization and Gmail send are intentionally not part of CI. Before a release, the repository owner should:

1. Create a disposable Google Cloud project or OAuth client intended for release testing.
2. Add the test Gmail identity according to the project's Google Auth audience mode.
3. Connect it through Settings and confirm the requested scopes are basic identity plus Gmail send only.
4. Send the self-addressed test and confirm the message appears once in Gmail Sent.
5. Restart TinyMails, confirm the account remains usable through the operating-system vault, then remove the disposable OAuth grant and local account data.

Do not put the real Desktop client file or any runtime data in this repository.

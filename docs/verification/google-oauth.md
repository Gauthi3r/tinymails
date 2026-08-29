# Google OAuth verification

Verified on 2026-08-29 against the current repository state with Node.js 22.

## Automated evidence

The full `npm run check` result is recorded in [foundation.md](foundation.md). Focused coverage verifies:

- Desktop-client validation and bounded browser-safe errors.
- Separate OAuth state and browser session identifiers, PKCE, expiry, and replay rejection.
- Only basic identity and `gmail.send` scopes are requested; previously granted scopes are not folded into the request.
- Account-specific client directories, `0600` client files, and isolated vault records.
- Removal of the local client directory, vault token, and account record on disconnect.
- Unicode message encoding and header-injection rejection.
- Gmail success, token refresh, authentication, retryable, permanent, and ambiguous delivery outcomes.
- Loopback callback handling, callback-page content security, sanitized session responses, and self-addressed test sends.
- Inline client-file onboarding, file-size limits, connected state, sending-rule editing, and disconnect confirmation.

Browser API responses omit credential directories, OAuth client contents, tokens, authorization codes, and provider error bodies.

## Manual release check

A real authorization, Gmail send, and desktop keyring round trip are intentionally not part of CI. Before a release:

1. Create a disposable Google Cloud project or Desktop OAuth client for release testing.
2. Add the test Gmail identity according to the project's Google Auth audience mode.
3. Connect it through Settings and confirm the consent screen requests basic identity and Gmail send only.
4. Send the self-addressed connection test and a one-recipient campaign preview. Confirm each appears once in Gmail Sent.
5. Restart TinyMails and confirm the account remains usable through the operating-system vault.
6. Disconnect the account in Settings and confirm its local client directory and credential-vault entry are gone.
7. Remove the disposable grant from Google Account connections.

Run the keyring steps on macOS, Windows, and a Linux desktop with a Secret Service-compatible keyring before calling those platforms release-tested. Do not put the real Desktop client file or runtime data in this repository.

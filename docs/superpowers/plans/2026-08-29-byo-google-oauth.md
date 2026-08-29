# Bring-your-own Google OAuth implementation plan

**Goal:** Let a TinyMails user connect a Gmail account with a Desktop OAuth client they own, send a test message, and use the production campaign runner without a managed TinyMails OAuth application.

**Architecture:** Keep OAuth orchestration in a service with injected Google and credential-vault ports. The browser uploads a Desktop client JSON file to the loopback API, opens Google's consent URL, and returns to a state-checked callback on `127.0.0.1`. Client metadata stays in an account-specific directory. Refresh and access tokens stay in the operating-system keyring. The Gmail adapter builds an RFC 5322 message and calls `users.messages.send` through Google's supported auth library.

**Scopes:** `openid`, `https://www.googleapis.com/auth/userinfo.email`, and `https://www.googleapis.com/auth/gmail.send`.

**Dependencies:** `google-auth-library`, `@napi-rs/keyring`.

**References:**

- Google Desktop OAuth loopback flow and PKCE guidance.
- Gmail sensitive and restricted scope table.
- Gmail `users.messages.send` raw message contract.
- `docs/superpowers/specs/2026-08-29-tinymails-v0.1-design.md`.

## Constraints

- Accept only a Google Desktop client JSON object with an `installed` root.
- Never return client secrets, tokens, credential paths, authorization codes, or raw Google errors to the browser.
- OAuth sessions expire after ten minutes and use a cryptographically random state plus PKCE.
- Bind callbacks to the existing loopback server. Do not create an internet-facing callback.
- Store client JSON with user-only file permissions. Store tokens in the operating-system keyring.
- A test double must cover every Google and keyring behavior. Automated tests never open a browser or contact Google.
- The send adapter must prevent header injection and preserve Unicode subjects and bodies.
- Authentication failures return the current recipient to pending and pause its campaign. An unknown delivery result remains failed and requires manual review.

## Task 1: OAuth client validation and credential vault

**Files:**

- Create `src/gmail/oauth-client.ts`.
- Create `src/gmail/credential-vault.ts`.
- Create `tests/oauth-client.test.ts`.
- Modify `package.json` and `package-lock.json`.

1. Write failing tests for a valid Desktop client, a web client, missing fields, non-Google endpoints, and browser-safe validation messages.
2. Add tests for an in-memory credential vault round trip and missing record.
3. Install `google-auth-library@11.0.2` and `@napi-rs/keyring@1.3.0`.
4. Implement `parseDesktopOAuthClient(input: unknown): DesktopOAuthClient` with exact endpoint and client-ID checks.
5. Define `CredentialVault` and implement `MemoryCredentialVault` plus `KeyringCredentialVault`. The keyring service name is `TinyMails`; account IDs are the usernames.
6. Run the focused tests, scanner, and lint.
7. Commit as `feat: add secure Google credential storage`.

## Task 2: OAuth session service

**Files:**

- Create `src/gmail/google-oauth.ts`.
- Create `tests/google-oauth.test.ts`.

**Ports:**

```ts
interface GoogleOAuthProvider {
  createAuthorization(input: AuthorizationInput): Promise<AuthorizationRequest>;
  exchangeCode(input: CodeExchangeInput): Promise<GoogleIdentity>;
}

interface GoogleIdentity {
  email: string;
  tokens: StoredGoogleTokens;
}
```

1. Write failing tests for PKCE/state generation, session expiry, state mismatch, account persistence, isolated account directories, and browser-safe failures.
2. Implement `GoogleOAuthService.start(clientJson, redirectUri)` and `finish(sessionId, state, code)`.
3. Persist the validated client to `<dataDir>/accounts/<opaque-id>/client.json` with mode `0600` only after a successful exchange.
4. Put tokens into `CredentialVault`, create the `Account` record with conservative defaults, and expose a one-time browser-safe session result.
5. Implement the real provider with `OAuth2Client.generateCodeVerifierAsync`, `generateAuthUrl`, `getToken`, and the OpenID user-info endpoint.
6. Run focused tests and commit as `feat: add Google OAuth sessions`.

## Task 3: Production Gmail adapter

**Files:**

- Create `src/gmail/google-adapter.ts`.
- Create `src/gmail/message.ts`.
- Create `tests/google-adapter.test.ts`.
- Create `tests/message.test.ts`.

1. Write failing message tests for Unicode, multiline bodies, header injection, and deterministic base64url encoding.
2. Write failing adapter tests for successful send IDs, token refresh persistence, auth errors, temporary errors, permanent errors, and account isolation.
3. Implement `buildRawMessage` with encoded UTF-8 subject, plain-text MIME, CRLF normalization, and a normalized recipient address.
4. Implement `GoogleGmailAccountAdapter`. Load the account's client metadata and tokens, persist token events, and call `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with `{ raw }`.
5. Map 401 and authentication 403 responses to `auth`, 408/429/5xx to `temporary`, and other 4xx responses to `permanent`. Log no response body or credential detail.
6. Keep `listInbound` empty until optional restricted-scope inbox tracking lands.
7. Run focused tests and commit as `feat: add the Google Gmail adapter`.

## Task 4: Loopback OAuth and test-send API

**Files:**

- Modify `src/server/app.ts`.
- Modify `src/server/index.ts`.
- Modify `src/server/repositories.ts` if the OAuth service needs an account transaction.
- Modify `tests/api.test.ts`.

1. Write failing API tests for OAuth start, callback state rejection, session status, connected-account sanitization, and test sends.
2. Add `POST /api/oauth/google/start`, `GET /api/oauth/google/callback`, and `GET /api/oauth/google/sessions/:id`.
3. Add `POST /api/accounts/:id/test`. Require a normalized example recipient in tests and return a bounded status.
4. Wire the real OAuth service, keyring vault, and Google adapter in the loopback entrypoint.
5. Render a small callback HTML page with a strict content-security policy and no account data, tokens, or codes.
6. Run API tests, full type checking, and scanner.
7. Commit as `feat: add the Gmail connection API`.

## Task 5: Inline Gmail onboarding UI

**Files:**

- Modify `src/app/api.ts`.
- Create `src/app/GmailSetup.tsx`.
- Create `src/app/GmailSetup.test.tsx`.
- Modify `src/app/SettingsPage.tsx`.
- Modify `src/app/App.tsx`.
- Modify `README.md`.

1. Write a failing UI test that opens the inline setup, rejects a non-Desktop client file, starts authorization, and renders the connected account after the session completes.
2. Add an honest four-step guide: create project, configure audience and test users, enable Gmail API, create and download a Desktop client.
3. Use a local file input and parse the selected JSON in the browser. Do not upload through a multipart temporary file.
4. Open the returned Google URL only from the user's click. Poll the local session endpoint until success, expiry, or failure.
5. Show the exact send-only scopes and explain that inbox tracking is not enabled.
6. Add a test-send field to connected account rows. Keep the account email and cap visible.
7. Update the README setup section and current limitations without implying that BYO OAuth removes Google's consent-screen or test-user rules.
8. Run UI tests, full check, and build.
9. Commit as `feat: add Gmail onboarding`.

## Task 6: OAuth integration verification

**Files:**

- Modify the v0.1 spec to record the direct-library adapter decision.
- Create `docs/verification/google-oauth.md`.

1. Run `npm run check`.
2. Confirm scanner and Git history contain no client IDs, secrets, tokens, credential files, real email addresses, or legacy names.
3. Confirm the local API exposes no credential directory or OAuth secret fields.
4. Record automated evidence and a manual checklist. The manual checklist must state that a real Google consent flow and send require the repository owner's Desktop OAuth client and cannot run in CI.
5. Commit as `docs: verify Google OAuth onboarding`.

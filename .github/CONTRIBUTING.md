# Contributing to TinyMails

TinyMails is still taking shape. Small, tested changes are easier to review than broad rewrites.

## Before you start

Open an issue for changes that affect storage formats, Gmail scopes, sending rules, or the public API. Bug fixes and focused documentation edits can go straight to a pull request.

Never add real contact data, Gmail credentials, token caches, logs, personal email addresses, or campaign exports. Use the reserved example domains in fixtures.

## Development

```bash
npm install
npm run check
```

Write a failing test before changing product behavior. Keep Gmail calls behind `GmailAccountAdapter`; tests must use the fake adapter and must not contact Google.

UI work should use the tokens and components in `src/styles` and `src/components`. TinyMails copies selected OA recipes into the repository, so do not add the OA CLI as a runtime dependency.

## Pull requests

Explain the user-visible change, the checks you ran, and any data-format or Gmail-permission impact. Keep generated files, build output, runtime data, and local editor settings out of the commit.

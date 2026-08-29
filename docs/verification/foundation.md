# Foundation verification

Verified on 2026-08-29 at commit `17f9f45` with Node.js `v22.17.1`.

## Commands and results

`npm run check`

- Public-tree scanner: passed with no findings.
- Oxlint: passed with no warnings or errors.
- Vitest: 33 tests passed across 8 files.
- TypeScript project build: passed.
- Vite production build: passed, with 2,072 modules transformed.

Repository hygiene checks:

```bash
git status --short
git log --oneline --decorate
git ls-files | sort
git ls-files | rg '<runtime and credential patterns>'
git grep -niE '<legacy name patterns>' -- .
git log --all -p --format= | rg -ni '<legacy name patterns>'
```

The worktree was clean before this record was written. No runtime directories, credential artifacts, logs, root campaign CSV files, build output, or legacy names appeared in tracked files or Git history.

`LICENSE` matched the official GNU AGPL-3.0 text byte for byte.

## Review fixes

An independent code review found concurrency and delivery ambiguity in the first runner implementation. The foundation now serializes repository mutations, gives each atomic write a unique temporary file, prevents concurrent campaign runners, observes pauses before claiming another recipient, and catches Gmail adapter exceptions.

If TinyMails stops after Gmail accepts a message but before the result is saved, the recipient becomes `failed` with a delivery-unknown explanation. TinyMails does not retry that recipient automatically. This is intentionally stricter than the original implementation plan, which returned every in-flight recipient to pending and could send a duplicate.

Daily caps use the Gmail account's timezone. Send delays choose a value inside the combined account and campaign bounds. The scanner checks planning documents for legacy names, credentials, and non-example addresses.

## Deferred v0.1 work

- Bring-your-own Google OAuth onboarding and a production Gmail adapter.
- The full CSV review and campaign composition workflow.
- Templates, backups, campaign detail, suppression management, and optional reply tracking.
- Release packaging, one-command startup, and distribution documentation.

The Gmail milestone will use Google's OAuth library and Gmail REST API behind the existing adapter. The latest Google Workspace CLI release has unresolved Desktop OAuth and account-isolation issues, so it is not a safe runtime dependency for TinyMails at this point.

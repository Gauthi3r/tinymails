# Security policy

## Supported versions

TinyMails is pre-release software. Security fixes apply to the latest commit on `main` until tagged releases begin.

## Report a vulnerability

Use GitHub's private vulnerability reporting for the repository. Do not open a public issue with credentials, OAuth files, contact data, or reproduction logs that contain private information.

Include the affected commit, a short reproduction, the impact, and any suggested fix. Remove account IDs, file paths, email addresses, and tokens before attaching output.

## Local security boundary

TinyMails binds its server to `127.0.0.1`. Runtime data and Google credentials belong in the configured application-data directory, never the source checkout. The public-tree scanner is a release guard, not a substitute for operating-system permissions or full-disk encryption.

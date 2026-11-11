# Security policy

## Supported versions

TinyMails is pre-release software. Security fixes apply to the latest commit on `main` until tagged releases begin.

## Report a vulnerability

Use GitHub's private vulnerability reporting for the repository. Do not open a public issue with credentials, OAuth files, contact data, or reproduction logs that contain private information.

Include the affected commit, a short reproduction, the impact, and any suggested fix. Remove account IDs, file paths, email addresses, and tokens before attaching output.

## Local security boundary

TinyMails binds its server to `127.0.0.1`, but loopback alone is not a trust boundary. A hostile website may try DNS rebinding or cross-origin requests against a local port. The server therefore rejects non-loopback `Host` headers before routing and rejects cross-origin `Origin` headers on state-changing requests. OAuth callbacks also require a short-lived, single-use state value.

The MCP endpoint at `/mcp` sits behind the same checks and is reachable only from the same computer. It offers agents no way to start a send unless the user enables it in Settings. That is a rule of the MCP connection, not a barrier between local programs: the local API cannot tell which program on the computer is calling it, so an agent that can run commands there has the same reach as the user. A way for a website or a remote host to reach `/mcp` or `/api` is a vulnerability; a local program calling the local API is not.

Runtime data and Google credentials belong in the configured application-data directory, never the source checkout. Data directories use user-only permissions where the platform honors POSIX modes. TinyMails acquires an exclusive lock before campaign recovery or repository access, so two server processes cannot send from the same data directory. The public-tree scanner is a release guard, not a substitute for operating-system permissions or full-disk encryption.

The scanner accepts optional private terms through `TINYMAILS_PRIVATE_TERMS`, separated by commas or newlines. Keep that value in your local shell or CI secret store. Do not commit private terms or hashes of short private terms.

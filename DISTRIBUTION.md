# Distribution

## Supported first release

TinyMails is distributed as a free, open-source GitHub repository. The supported installation path is:

```bash
git clone https://github.com/Gauthi3r/tinymails.git
cd tinymails
npm install
npm start
```

The launcher builds the frontend, starts the Node process on `127.0.0.1`, waits for the health endpoint, and opens the app. Users bring their own Google Desktop OAuth client. Runtime records remain in the local application-data directory and Google tokens remain in the operating-system credential vault.

GitHub tags provide source archives automatically. Release notes should state the tested Node version, migration notes, test count, scanner result, and known Google consent limitations. Checksums for any future generated binary artifact belong in the release assets.

## Why not a hosted deployment yet

The local architecture assumes one operating-system user, a loopback OAuth callback, an OS credential vault, local files, and a long-running campaign process. Moving the same server to a public host would require authentication, tenant isolation, encrypted server-side credentials, durable jobs, abuse controls, deletion workflows, and a verified shared Google OAuth app. That is a different product and threat model.

Vercel can host `tinymails.com` and future documentation. It should not host the current application server.

## Later options

1. Publish an npm executable after confirming package ownership and testing native keyring installation on macOS, Windows, and Linux.
2. Add unsigned preview desktop builds for contributors, then signed and notarized installers only after repeat usage justifies certificate and CI maintenance.
3. Apply for Google OAuth verification when TinyMails is ready to offer a shared client. Keep bring-your-own OAuth available for self-hosters.
4. Consider a hosted edition only with a separate security and abuse-prevention design.

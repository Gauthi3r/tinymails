# TinyMails Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a clean, publishable TinyMails repository with a tested local data model, campaign engine, Gmail adapter boundary, and OA-styled application shell.

**Architecture:** Keep domain rules as pure TypeScript modules, persistence behind atomic JSON stores, Gmail access behind an injected adapter, and HTTP routes in a thin Express layer. The React client consumes the local API and starts with Campaigns, Leads, Replies, and Settings screens using selected `oa-design` tokens and source recipes.

**Tech Stack:** Node.js 22+, React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Base UI, Express 5, Vitest, Supertest, `oa-design` CLI 0.2.1.

**Spec:** `docs/superpowers/specs/2026-08-29-tinymails-v0.1-design.md`

## Global Constraints

- The repository and Git history must contain no private runtime data, credentials, campaign CSV files, logs, personal domains, or personal email addresses.
- Runtime data defaults outside the repository and supports `TINYMAILS_DATA_DIR` for development and tests.
- The local server binds only to `127.0.0.1`.
- Gmail calls must go through the `GmailAccountAdapter` interface. Tests never use a real Google account or network access.
- Contact status is derived from campaign history and suppression data, never stored on lead records.
- Duplicate, bounce, and suppression checks run at campaign creation and immediately before each send.
- UI copy uses TinyMails, sentence case, plain words, and no old product or customer-specific terminology.
- The UI uses `oa-design` tokens and source recipes rather than adding a runtime design-system dependency.
- Each task ends with passing focused tests and a commit.

## File structure

```text
tinymails/
├── .github/workflows/ci.yml             # public validation pipeline
├── docs/superpowers/                     # approved spec and implementation plans
├── public/                               # safe static assets only
├── scripts/scan-public.mjs               # source-tree trace and secret guard
├── src/
│   ├── app/                              # React routes and app state
│   ├── components/                       # OA and shared UI source
│   ├── domain/                           # pure product types and rules
│   ├── gmail/                            # adapter interface and fake adapter
│   ├── server/                           # persistence, campaign runner, API, entrypoint
│   ├── styles/                           # OA tokens and app CSS
│   └── main.tsx                          # browser entrypoint
├── tests/                                # integration and public-tree tests
├── .gitignore
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

### Task 1: Public scaffold and sanitization guard

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `scripts/scan-public.mjs`
- Create: `tests/scan-public.test.ts`

**Interfaces:**
- Consumes: Node.js filesystem APIs and `TINYMAILS_DATA_DIR` from the global constraints.
- Produces: `scanTree(root: string): Promise<ScanFinding[]>` and the `npm run scan` command used by every later task and CI.

`ScanFinding` is `{ rule: "credential-file" | "email-address" | "secret-token" | "private-name" | "runtime-file"; path: string }`.

- [ ] **Step 1: Write the scanner test**

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanTree } from "../scripts/scan-public.mjs";

describe("public tree scanner", () => {
  it("flags credentials, runtime files, and non-example email addresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    const credentialKey = ["refresh", "token"].join("_");
    const privateAddress = ["person", "private", "invalid"].join("@").replace("@invalid", ".invalid");
    await writeFile(join(root, "token_cache.json"), JSON.stringify({ [credentialKey]: "secret" }));
    await writeFile(join(root, "notes.txt"), `contact ${privateAddress}`);
    const findings = await scanTree(root);
    expect(findings.map((finding) => finding.rule)).toEqual(
      expect.arrayContaining(["credential-file", "email-address", "secret-token"]),
    );
  });

  it("allows documented example addresses", async () => {
    const root = await mkdtemp(join(tmpdir(), "tinymails-scan-"));
    await writeFile(join(root, "README.md"), "Send a test to you@example.com");
    expect(await scanTree(root)).toEqual([]);
  });
});
```

- [ ] **Step 2: Create the package scaffold and run the focused test to verify failure**

Create `package.json` with Node `>=22`, ESM, scripts for `dev`, `build`, `serve`, `lint`, `test`, `scan`, and `check`. Add runtime dependencies for React, Express, Tailwind, Base UI, Motion, Lucide, and the font packages. Add TypeScript, Vite, Vitest, Supertest, Oxlint, and type packages as development dependencies.

Run: `npm install && npm test -- tests/scan-public.test.ts`

Expected: FAIL because `scripts/scan-public.mjs` does not exist.

- [ ] **Step 3: Implement the scanner**

```js
export async function scanTree(root) {
  const findings = [];
  // Walk without following symlinks. Skip .git and node_modules.
  // Flag forbidden file names, credential keys, known private-name patterns,
  // and email addresses except the example.com, example.org, and example.net domains.
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = await scanTree(process.cwd());
  if (findings.length) {
    for (const finding of findings) console.error(`${finding.rule}: ${finding.path}`);
    process.exitCode = 1;
  }
}
```

Use explicit forbidden filename patterns for `client_secret.json`, `token_cache.json`, `credentials.json`, `credentials.enc`, `.encryption_key`, `*.log`, and top-level campaign CSV files. Scan text files for `access_token`, `refresh_token`, `client_secret`, private-installation name patterns stored in a non-exported constant, and non-example email addresses.

- [ ] **Step 4: Add repository ignores**

Ignore `node_modules/`, `dist/`, coverage output, logs, `.env*` except `.env.example`, `data/`, `.tinymails/`, OAuth JSON, token caches, encrypted credential files, and root-level CSV files except `examples/*.csv`.

- [ ] **Step 5: Run tests and scanner**

Run: `npm test -- tests/scan-public.test.ts && npm run scan`

Expected: PASS with no findings in the repository.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts index.html scripts/scan-public.mjs tests/scan-public.test.ts
git commit -m "chore: scaffold the TinyMails repository"
```

### Task 2: Domain types and atomic persistence

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/server/data-dir.ts`
- Create: `src/server/json-store.ts`
- Create: `tests/json-store.test.ts`

**Interfaces:**
- Consumes: `TINYMAILS_DATA_DIR` and Node filesystem APIs.
- Produces: `resolveDataDir(env?: NodeJS.ProcessEnv): string`, `JsonStore<T>`, and shared `Account`, `Lead`, `Campaign`, `Recipient`, `Template`, and `Reply` types.

- [ ] **Step 1: Write data-directory and atomic-store tests**

```ts
it("uses the explicit data directory", () => {
  expect(resolveDataDir({ TINYMAILS_DATA_DIR: "/tmp/tinymails-test" })).toBe(
    "/tmp/tinymails-test",
  );
});

it("round trips JSON without leaving a temporary file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tinymails-store-"));
  const store = new JsonStore(join(dir, "campaigns.json"), [] as Campaign[]);
  const stored = [{ id: "campaign-1" }] as Campaign[];
  await store.write(stored);
  expect(await store.read()).toEqual(stored);
  expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- tests/json-store.test.ts`

Expected: FAIL because the imported modules do not exist.

- [ ] **Step 3: Define shared types**

Define exact status unions:

```ts
export type RecipientStatus = "pending" | "sending" | "sent" | "failed" | "skipped" | "not-sent";
export type CampaignStatus = "running" | "paused" | "done" | "stopped";
export type GmailCapability = "send" | "inbox-tracking";
export type LeadStatus = "new" | "queued" | "contacted" | "replied" | "bounced" | "do-not-contact";
```

`Lead` stores `email`, optional `firstName`, optional `company`, `source`, and `addedAt`. It does not contain `LeadStatus`. `Account` stores an opaque ID, email, label, capabilities, cap, delay bounds, time zone, sending window, and credential-directory reference.

- [ ] **Step 4: Implement data-directory resolution and `JsonStore<T>`**

`JsonStore.read()` returns the default value when the file does not exist. `write()` creates the parent directory, writes JSON to a sibling file named `<basename>.<pid>.tmp`, then renames it over the target.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- tests/json-store.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/server/data-dir.ts src/server/json-store.ts tests/json-store.test.ts
git commit -m "feat: add local domain storage"
```

### Task 3: Lead, suppression, and campaign rules

**Files:**
- Create: `src/domain/email.ts`
- Create: `src/domain/leads.ts`
- Create: `src/domain/campaigns.ts`
- Create: `tests/leads.test.ts`
- Create: `tests/campaigns.test.ts`

**Interfaces:**
- Consumes: types from `src/domain/types.ts`.
- Produces: `normalizeEmail`, `mergeLeads`, `deriveLeadStatus`, `availableLeads`, `createCampaign`, `renderMessage`, `sentToday`, and `recoverInterruptedCampaigns`.

Use these exact signatures:

```ts
normalizeEmail(value: string): string | null
mergeLeads(existing: Lead[], incoming: ContactInput[], source: string, now: string): MergeLeadsResult
deriveLeadStatus(lead: Lead, campaigns: Campaign[], suppressed: Set<string>): LeadStatus
availableLeads(leads: Lead[], campaigns: Campaign[], suppressed: Set<string>, source?: string): Lead[]
createCampaign(input: CreateCampaignInput, blocks: CampaignBlocks): CreateCampaignResult
renderMessage(template: string, contact: ContactInput): string
sentToday(campaigns: Campaign[], accountId: string, day: string): number
recoverInterruptedCampaigns(campaigns: Campaign[]): Campaign[]
```

- [ ] **Step 1: Write failing lead-rule tests**

```ts
it("enriches an existing lead without overwriting known values", () => {
  const now = "2026-08-29T10:00:00.000Z";
  const result = mergeLeads(
    [{ email: "Person@Example.com", firstName: "Ada", source: "Original", addedAt: now }],
    [{ email: "person@example.com", firstName: "Changed", company: "Analytical Engines" }],
    "Conference",
    now,
  );
  expect(result.leads[0]).toMatchObject({
    email: "person@example.com",
    firstName: "Ada",
    company: "Analytical Engines",
    source: "Original",
  });
  expect(result).toMatchObject({ added: 0, existing: 1, enriched: 1 });
});

it("derives suppression before every other lead state", () => {
  const lead: Lead = {
    email: "ada@example.com",
    firstName: "Ada",
    source: "Product beta",
    addedAt: "2026-08-29T10:00:00.000Z",
  };
  expect(deriveLeadStatus(lead, [], new Set([lead.email]))).toBe(
    "do-not-contact",
  );
});
```

- [ ] **Step 2: Write failing campaign-rule tests**

```ts
it("excludes duplicate, bounced, and suppressed recipients", () => {
  const result = createCampaign({
    name: "Product update",
    subject: "A short update",
    body: "Hi {firstName}",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    recipients: [
      { email: "ready@example.com" },
      { email: "blocked@example.com" },
      { email: "bounce@example.com" },
      { email: "queued@example.com" },
    ],
    now: "2026-08-29T10:00:00.000Z",
  }, {
    suppressed: new Set(["blocked@example.com"]),
    bounced: new Set(["bounce@example.com"]),
    queued: new Set(["queued@example.com"]),
  });
  expect(result.campaign.recipients.map((recipient) => recipient.email)).toEqual([
    "ready@example.com",
  ]);
  expect(result.excluded).toHaveLength(3);
});

it("returns in-flight recipients to pending after restart", () => {
  const campaign = {
    id: "campaign-1",
    name: "Product update",
    subject: "A short update",
    body: "Hi there",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    createdAt: "2026-08-29T10:00:00.000Z",
    status: "running",
    recipients: [{ email: "ada@example.com", accountId: "account-1", status: "sending" }],
  } satisfies Campaign;
  const [recovered] = recoverInterruptedCampaigns([
    campaign,
  ]);
  expect(recovered.status).toBe("paused");
  expect(recovered.recipients[0].status).toBe("pending");
});
```

- [ ] **Step 3: Run focused tests to verify failure**

Run: `npm test -- tests/leads.test.ts tests/campaigns.test.ts`

Expected: FAIL because the rule modules do not exist.

- [ ] **Step 4: Implement email normalization and lead rules**

Normalize by trimming and lowercasing. Reject values without one `@`, a local part, and a dotted domain. `mergeLeads` only fills missing names and companies. `deriveLeadStatus` applies this order: do-not-contact, bounced, replied, contacted, queued, new.

- [ ] **Step 5: Implement campaign creation and recovery**

`createCampaign` normalizes, deduplicates, excludes blocked or queued recipients, assigns accounts round-robin, and creates only `pending` recipients. `renderMessage` replaces `{firstName}` with `there` and `{company}` with `your company` when absent. `recoverInterruptedCampaigns` pauses running campaigns and resets `sending` recipients to `pending`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/leads.test.ts tests/campaigns.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/email.ts src/domain/leads.ts src/domain/campaigns.ts tests/leads.test.ts tests/campaigns.test.ts
git commit -m "feat: add safe campaign rules"
```

### Task 4: Gmail boundary and campaign runner

**Files:**
- Create: `src/gmail/adapter.ts`
- Create: `src/gmail/fake-adapter.ts`
- Create: `src/server/campaign-runner.ts`
- Create: `tests/campaign-runner.test.ts`

**Interfaces:**
- Consumes: `Campaign`, `Account`, and message types from `src/domain/types.ts`, plus `renderMessage` and `sentToday`.
- Produces: `GmailAccountAdapter`, `FakeGmailAccountAdapter`, and `CampaignRunner.run(campaignId: string): Promise<void>`.

The runner defines and consumes these repository ports, which Task 5 implements:

```ts
interface CampaignRepository {
  get(id: string): Promise<Campaign | null>;
  list(): Promise<Campaign[]>;
  save(campaign: Campaign): Promise<void>;
}
interface AccountRepository {
  get(id: string): Promise<Account | null>;
}
interface SuppressionRepository {
  has(email: string): Promise<boolean>;
}
```

- [ ] **Step 1: Write runner tests with the fake adapter**

```ts
it("pauses on auth failure without consuming the recipient", async () => {
  gmail.queueResult({ ok: false, kind: "auth", message: "Reconnect this account." });
  await runner.run("campaign-1");
  const campaign = await repository.getCampaign("campaign-1");
  expect(campaign.status).toBe("paused");
  expect(campaign.recipients[0].status).toBe("pending");
});

it("checks suppression immediately before sending", async () => {
  suppression.add("ready@example.com");
  await runner.run("campaign-1");
  expect(gmail.sent).toEqual([]);
  expect((await repository.getCampaign("campaign-1")).recipients[0].status).toBe("skipped");
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- tests/campaign-runner.test.ts`

Expected: FAIL because the adapter and runner do not exist.

- [ ] **Step 3: Define the Gmail adapter**

```ts
export interface GmailAccountAdapter {
  status(account: Account): Promise<AccountStatus>;
  send(account: Account, message: OutgoingMessage): Promise<SendResult>;
  listInbound(account: Account, cursor?: InboxCursor): Promise<InboundResult>;
}
```

`SendResult` is `{ ok: true; messageId: string }` or `{ ok: false; kind: "auth" | "temporary" | "permanent"; message: string }`.

- [ ] **Step 4: Implement the fake adapter**

The fake stores sent messages in memory, supports queued results, and returns deterministic account and inbox responses. It has no filesystem or network access.

- [ ] **Step 5: Implement the runner**

Inject campaign, account, and suppression repositories, the Gmail adapter, a clock, and a delay function. The runner checks account caps and sending hours, suppression, auth errors, and pending work. Tests inject a no-wait delay. Production delay uses `setTimeout` only after a successful or permanent send result.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/campaign-runner.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/gmail/adapter.ts src/gmail/fake-adapter.ts src/server/campaign-runner.ts tests/campaign-runner.test.ts
git commit -m "feat: add the Gmail campaign boundary"
```

### Task 5: Local repositories and Express API

**Files:**
- Create: `src/server/repositories.ts`
- Create: `src/server/app.ts`
- Create: `src/server/index.ts`
- Create: `tests/api.test.ts`

**Interfaces:**
- Consumes: `JsonStore`, domain rules, `CampaignRunner`, and `GmailAccountAdapter`.
- Produces: `createRepositories(dataDir: string)`, `createApp(dependencies: AppDependencies)`, and the loopback server entrypoint.

- [ ] **Step 1: Write API tests**

```ts
it("imports leads and returns derived status", async () => {
  await request(app).post("/api/leads/import").send({
    source: "Product beta",
    leads: [{ email: "ada@example.com", firstName: "Ada" }],
  }).expect(200);
  const response = await request(app).get("/api/leads").expect(200);
  expect(response.body.leads).toEqual([
    expect.objectContaining({ email: "ada@example.com", status: "new" }),
  ]);
});

it("creates a campaign without exposing blocked recipients", async () => {
  await request(app).post("/api/suppression").send({ emails: ["blocked@example.com"] });
  const response = await request(app).post("/api/campaigns").send({
    name: "Product update",
    subject: "A short update",
    body: "Hi {firstName}",
    accountIds: ["account-1"],
    dailyCap: 25,
    delayMinSeconds: 30,
    delayMaxSeconds: 45,
    recipients: [{ email: "ready@example.com" }, { email: "blocked@example.com" }],
  }).expect(201);
  expect(response.body.excluded).toEqual([
    expect.objectContaining({ email: "blocked@example.com", reason: "do-not-contact" }),
  ]);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `npm test -- tests/api.test.ts`

Expected: FAIL because the server modules do not exist.

- [ ] **Step 3: Implement local repositories**

Create typed repositories for accounts, campaigns, leads, templates, and suppression. Suppression reads and writes normalized newline-delimited addresses. Campaign writes persist every state change made by the runner.

- [ ] **Step 4: Implement the Express app**

Add JSON routes for health, accounts, leads, campaigns, templates, replies, and suppression. Keep route handlers thin. Return `400` for validation errors, `404` for missing IDs, and bounded public error messages. Do not return filesystem credential paths to the browser.

- [ ] **Step 5: Implement the entrypoint**

Resolve the data directory, recover interrupted campaigns, create repositories and the adapter dependency, serve `dist`, and listen on `127.0.0.1` with `TINYMAILS_PORT` defaulting to `3210`.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- tests/api.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/repositories.ts src/server/app.ts src/server/index.ts tests/api.test.ts
git commit -m "feat: add the local TinyMails API"
```

### Task 6: OA app shell and baseline screens

**Files:**
- Create: `src/styles/tokens.css`
- Create: `src/styles/app.css`
- Create: `src/components/button.tsx`
- Create: `src/components/squircle-card.tsx`
- Create: `src/components/tab-bar.tsx`
- Create: `src/components/notice-strip.tsx`
- Create: `src/app/api.ts`
- Create: `src/app/App.tsx`
- Create: `src/app/CampaignsPage.tsx`
- Create: `src/app/LeadsPage.tsx`
- Create: `src/app/RepliesPage.tsx`
- Create: `src/app/SettingsPage.tsx`
- Create: `src/main.tsx`
- Create: `src/app/App.test.tsx`

**Interfaces:**
- Consumes: JSON routes from Task 5 and `oa-design` source recipes.
- Produces: `AppApi`, `createHttpApi()`, the fixed-header application shell, and navigable baseline pages used by later UI plans.

- [ ] **Step 1: Install the OA recipe source**

Run:

```bash
npx getopen-design@0.2.1 tokens
npx getopen-design@0.2.1 add button squircle-card tab-bar notice-strip
```

Copy only the generated token and component source into the exact paths above. Preserve the MIT attribution in source comments or `NOTICE.md`. Do not add a runtime dependency on `getopen-design`.

- [ ] **Step 2: Write the shell test**

```tsx
it("navigates between the primary TinyMails pages", async () => {
  const fakeApi: AppApi = {
    getCampaigns: async () => [],
    getLeads: async () => ({ leads: [], counts: { total: 0 }, sources: [] }),
    getReplies: async () => [],
    getSettings: async () => ({ accounts: [], dataDir: "/tmp/tinymails-test", version: "0.1.0" }),
  };
  render(<App api={fakeApi} />);
  expect(screen.getByRole("heading", { name: "Campaigns" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Leads" }));
  expect(screen.getByRole("heading", { name: "Leads" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible();
});
```

- [ ] **Step 3: Run the focused test to verify failure**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL because the app shell does not exist.

- [ ] **Step 4: Build the application shell**

Use a fixed 56-pixel header, TinyMails wordmark, account status on the right, a centered OA tab bar for Campaigns, Leads, and Replies, and a Settings action. Paint the grey stage inside the app root. Use `max-w-5xl`, responsive padding, and white squircle plates. Respect reduced motion.

- [ ] **Step 5: Add baseline page content**

Campaigns shows active and recent campaigns with progress. Leads shows counts, search, source filters, and a table. Replies shows the work queue or an explanatory empty state. Settings shows Gmail accounts, sending rules, suppression, data path, and version fields backed by real API responses, not static claims.

- [ ] **Step 6: Run UI tests and build**

Run: `npm test -- src/app/App.test.tsx && npm run build`

Expected: PASS and Vite emits `dist/`.

- [ ] **Step 7: Commit**

```bash
git add src/styles src/components src/app src/main.tsx NOTICE.md
git commit -m "feat: add the TinyMails app shell"
```

### Task 7: Public repository documentation and CI

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `TRADEMARKS.md`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `examples/contacts.csv`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all package scripts and scanner behavior from earlier tasks.
- Produces: a publishable repository with reproducible validation.

- [ ] **Step 1: Add the AGPL-3.0 license and trademark policy**

Use the unmodified AGPL-3.0 license text. State in `TRADEMARKS.md` that the source license does not grant rights to use the TinyMails name, logo, or confusingly similar marks to identify modified or hosted versions.

- [ ] **Step 2: Write public documentation**

README sections must cover the product boundary, local data storage, permission-based use, prerequisites, development setup, test commands, bring-your-own OAuth status, current limitations, and the roadmap link. Do not claim Gmail setup is complete until the later onboarding workstream lands.

- [ ] **Step 3: Add a safe example CSV**

```csv
email,firstName,company
ada@example.com,Ada,Analytical Engines
grace@example.org,Grace,Compiler Studio
linus@example.net,Linus,Kernel Works
```

- [ ] **Step 4: Add CI**

On pushes and pull requests, use Node 22, `npm ci`, `npm run scan`, `npm run lint`, `npm test -- --run`, and `npm run build`. Grant workflow contents read permission only.

- [ ] **Step 5: Run the full verification suite**

Run:

```bash
npm run scan
npm run lint
npm test -- --run
npm run build
git grep -niE 'private-installation-name|private-domain-pattern' -- . ':!docs/superpowers/plans/*'
git status --short
```

Expected: all package commands pass, the trace grep prints nothing, and only the intended documentation and CI files are untracked.

- [ ] **Step 6: Commit**

```bash
git add README.md LICENSE TRADEMARKS.md SECURITY.md CONTRIBUTING.md CODE_OF_CONDUCT.md examples/contacts.csv .github/workflows/ci.yml
git commit -m "docs: prepare the public repository"
```

### Task 8: Foundation integration review

**Files:**
- Modify: files identified by failing checks only
- Create: `docs/verification/foundation.md`

**Interfaces:**
- Consumes: the complete foundation repository.
- Produces: a recorded verification result and a clean base for the Gmail onboarding plan.

- [ ] **Step 1: Run the complete check**

Run: `npm run check`

Expected: scanner, lint, all Vitest tests, and production build pass.

- [ ] **Step 2: Run repository hygiene checks**

Run:

```bash
git status --short
git log --oneline --decorate
git ls-files | sort
```

Confirm no runtime data, credentials, logs, root CSV files, or build output are tracked.

- [ ] **Step 3: Record verification**

Create `docs/verification/foundation.md` containing the commit under test, Node version, exact commands, pass counts, build result, scanner result, and any explicitly deferred v0.1 work. The deferred list must name the next workstreams: Gmail OAuth onboarding, full campaign UI, product improvements, and release packaging.

- [ ] **Step 4: Commit**

```bash
git add docs/verification/foundation.md
git commit -m "docs: verify the TinyMails foundation"
```

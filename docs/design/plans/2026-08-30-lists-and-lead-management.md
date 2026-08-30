# Lists and Lead Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-source contacts with multi-list membership, add paginated lead management and bulk actions, target campaigns by list, and install the supplied TinyMails logo.

**Architecture:** Keep contacts globally deduplicated by normalized email and store list IDs on each contact. Store list metadata separately in `lists.json`, migrate legacy `source` records at repository startup, and expose paginated/filterable APIs. Keep one browser-local campaign draft and change its filter from source name to list ID.

**Tech Stack:** TypeScript, React 19, Express, JSON file repositories, Vitest, Testing Library, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-08-30-lists-and-lead-management-design.md`

## Global constraints

- A contact may belong to multiple lists but remains unique by normalized email.
- The existing `source` data must migrate without dropping contacts.
- Leads use 50 rows per page in the UI and the server caps page size at 100.
- Delete removes the lead and unsent recipients but preserves completed delivery history.
- TinyMails supports one active browser-local draft in v0.1.
- No new runtime dependency is required.
- Preserve all existing uncommitted user changes.

---

### Task 1: List domain model and legacy migration

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/leads.ts`
- Modify: `src/server/repositories.ts`
- Test: `tests/leads.test.ts`
- Test: `tests/repositories.test.ts`

**Interfaces:**
- Produces: `ContactList`, `Lead.listIds`, `mergeLeads(existing, incoming, listId, now)`.
- Produces: `Repositories.lists` and `migrateLegacyLeadSources(repositories, clock)`.

- [ ] **Step 1: Write failing domain tests**

Add tests proving that importing a known email adds a second `listId`, preserves existing memberships, enriches missing fields, and does not duplicate list IDs.

```ts
expect(mergeLeads(existing, incoming, "list-b", now).leads[0].listIds)
  .toEqual(["list-a", "list-b"])
```

- [ ] **Step 2: Run the domain test and verify it fails**

Run: `npm test -- tests/leads.test.ts`

Expected: FAIL because `Lead` and `mergeLeads` still use `source`.

- [ ] **Step 3: Implement `ContactList`, `Lead.listIds`, and list-aware merge/filter helpers**

Add this model and replace source equality with membership checks:

```ts
export interface ContactList {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Lead extends ContactInput {
  listIds: string[]
  addedAt: string
}
```

- [ ] **Step 4: Run the domain test and verify it passes**

Run: `npm test -- tests/leads.test.ts`

- [ ] **Step 5: Write failing repository migration tests**

Seed `leads.json` with legacy `{ source: "Beta" }` rows. Assert that repository initialization creates one case-insensitive list, assigns its ID to each matching lead, removes `source` on disk, and produces the same result on a second run.

- [ ] **Step 6: Run the repository test and verify it fails**

Run: `npm test -- tests/repositories.test.ts`

Expected: FAIL because no list repository or migration exists.

- [ ] **Step 7: Add list persistence and restart-safe migration**

Create `CollectionRepository<ContactList>` at `lists.json`. Let `LeadRepository` read the legacy union during migration, write list records first, then replace leads atomically with the new shape. Reuse names with `name.trim().toLocaleLowerCase()`.

- [ ] **Step 8: Run domain and repository tests**

Run: `npm test -- tests/leads.test.ts tests/repositories.test.ts`

---

### Task 2: Paginated lead queries and list-aware imports

**Files:**
- Modify: `src/server/app.ts`
- Modify: `src/app/api.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Produces: `GET /api/lists`.
- Produces: `GET /api/leads?page&pageSize&query&listId&status`.
- Produces: `POST /api/leads/import` with `target.listId` or `target.listName`.
- Produces: `LeadsResponse.pagination` and `AppApi.getLeads(filters)`.

- [ ] **Step 1: Write failing API tests for lists, import targets, and pagination**

Cover new-list creation, case-insensitive reuse, importing a known contact into another list, `pageSize=50`, the server maximum of 100, search, list/status filters, and a page number past the end.

```ts
await request(app).post("/api/leads/import").send({
  target: { listName: "Product beta" },
  leads: [{ email: "ada@example.com" }],
}).expect(200)
```

- [ ] **Step 2: Run focused API tests and verify they fail**

Run: `npm test -- tests/api.test.ts`

- [ ] **Step 3: Implement list resolution and query parsing**

Validate one import target, resolve or create the list, merge by its ID, and return the resolved list with merge counts. Parse positive integer pagination, cap the size, decorate statuses, filter, sort by newest contact, and slice the requested page.

- [ ] **Step 4: Update the browser API contract**

Define:

```ts
interface LeadFilters {
  page?: number
  pageSize?: number
  query?: string
  listId?: string
  status?: LeadStatus | ""
}
```

Encode only populated values with `URLSearchParams`.

- [ ] **Step 5: Run API tests and typecheck**

Run: `npm test -- tests/api.test.ts && npm run typecheck`

---

### Task 3: Bulk membership and deletion operations

**Files:**
- Modify: `src/domain/leads.ts`
- Modify: `src/server/app.ts`
- Modify: `src/app/api.ts`
- Test: `tests/leads.test.ts`
- Test: `tests/api.test.ts`

**Interfaces:**
- Produces: `POST /api/leads/bulk`.
- Produces: `AppApi.bulkUpdateLeads(selection, operation)`.

- [ ] **Step 1: Write failing tests for selection resolution and each operation**

Test explicit email selection and filter selection with exclusions. Test add-to-list idempotency, remove-from-list behavior, and permanent deletion.

- [ ] **Step 2: Write failing campaign cleanup tests**

Create a paused campaign containing pending, sending, failed, and sent recipients. Assert that delete removes pending recipients, skips a sending recipient, and preserves sent and failed audit rows.

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `npm test -- tests/leads.test.ts tests/api.test.ts`

- [ ] **Step 4: Implement the bulk endpoint**

Resolve selections against current filtered contacts. Validate target lists. Apply membership changes through the lead repository. For delete, update campaigns before removing leads, return `{ affected, skipped, skippedEmails }`, and keep completed or failed recipients.

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm test -- tests/leads.test.ts tests/api.test.ts && npm run typecheck`

---

### Task 4: Shared list-aware CSV import

**Files:**
- Modify: `src/app/CsvImportPanel.tsx`
- Modify: `src/app/LeadsPage.test.tsx`
- Modify: `src/app/CampaignsPage.test.tsx`

**Interfaces:**
- Consumes: `ContactList[]`, `AppApi.importLeads(target, contacts)`.
- Produces: `onImported(result)` with the resolved list.

- [ ] **Step 1: Write failing component tests**

Assert that the panel can choose an existing list, switch to a new-list name, reuses CSV review, and calls the new import contract.

- [ ] **Step 2: Run the component tests and verify they fail**

Run: `npm test -- src/app/LeadsPage.test.tsx src/app/CampaignsPage.test.tsx`

- [ ] **Step 3: Replace Source name with list targeting controls**

Render `Existing list` and `New list` modes. Require a valid selection or non-empty name before import. Keep the current 5 MB client file limit and review table.

- [ ] **Step 4: Run the component tests**

Run: `npm test -- src/app/LeadsPage.test.tsx src/app/CampaignsPage.test.tsx`

---

### Task 5: Paginated Leads interface and bulk actions

**Files:**
- Modify: `src/app/LeadsPage.tsx`
- Modify: `src/app/LeadsPage.test.tsx`

**Interfaces:**
- Consumes: paginated `getLeads`, lists, and `bulkUpdateLeads`.

- [ ] **Step 1: Write failing UI tests**

Cover API pagination parameters, Previous/Next controls, page checkbox selection, `Select all filtered`, Add to list, Remove from current list, Delete confirmation copy, and reloading after a mutation.

- [ ] **Step 2: Run the Leads tests and verify they fail**

Run: `npm test -- src/app/LeadsPage.test.tsx`

- [ ] **Step 3: Implement server-driven filtering and pagination**

Use 50 rows per page. Reset page and selection when filters change. Show total match count and `Page X of Y`. Disable Previous and Next at their boundaries.

- [ ] **Step 4: Implement the selection bar and dialogs**

Track either explicit emails or all-filtered mode plus exclusions. Add a list picker for Add. Only expose Remove when a list filter is active. Confirm Remove and Delete, and state that Delete keeps prior delivery history.

- [ ] **Step 5: Run Leads tests and accessibility-focused assertions**

Run: `npm test -- src/app/LeadsPage.test.tsx`

---

### Task 6: List-based campaign recipients and compatible drafts

**Files:**
- Modify: `src/app/campaign-draft.ts`
- Modify: `src/app/CampaignComposer.tsx`
- Modify: `src/app/CampaignsPage.test.tsx`
- Test: `src/app/campaign-draft.test.ts`

**Interfaces:**
- Produces: `CampaignDraft.version: 2` and `listId: string`.
- Consumes: paginated or list-filtered lead queries and shared CSV import.

- [ ] **Step 1: Write failing draft compatibility tests**

Assert that v2 drafts round-trip a list ID and a valid v1 draft loads with an empty list ID while preserving message, accounts, limits, and selected emails.

- [ ] **Step 2: Write failing composer tests**

Assert that Recipients offers `Existing list` and `Upload CSV`, selecting a list loads its available contacts, and a completed CSV import selects the returned list.

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `npm test -- src/app/campaign-draft.test.ts src/app/CampaignsPage.test.tsx`

- [ ] **Step 4: Implement draft migration and list targeting**

Persist `listId` in v2. Convert v1 on read without its source filter. Keep the single-draft Resume/Discard behavior and do not restore the New campaign button while a draft exists.

- [ ] **Step 5: Run campaign tests**

Run: `npm test -- src/app/campaign-draft.test.ts src/app/CampaignsPage.test.tsx`

---

### Task 7: TinyMails logo and favicon

**Files:**
- Create: `src/assets/tinymails-logo.png`
- Create: `public/favicon-32.png`
- Create: `public/apple-touch-icon.png`
- Modify: `src/app/App.tsx`
- Modify: `src/app/App.test.tsx`
- Modify: `index.html`
- Test: `tests/index-html.test.ts`

**Interfaces:**
- The nav exposes an image with accessible name `TinyMails home`.

- [ ] **Step 1: Write failing app and HTML tests**

Assert that the floating tab bar contains the logo before Campaigns and that `index.html` links both favicon sizes.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- src/app/App.test.tsx tests/index-html.test.ts`

- [ ] **Step 3: Copy and resize the approved artwork**

Copy the supplied PNG without altering its transparency. Generate 32-pixel and 180-pixel square PNGs with the full mark centered and padded enough to avoid clipping.

- [ ] **Step 4: Move the logo into the floating navigation**

Remove the separate mark below the nav. Add a home button as the first tab-bar item, sized to remain clear at desktop and mobile widths.

- [ ] **Step 5: Link favicon assets and run tests**

Run: `npm test -- src/app/App.test.tsx tests/index-html.test.ts`

---

### Task 8: Documentation and release verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-29-tinymails-v0.1-design.md`
- Modify: `docs/verification/foundation.md`

**Interfaces:**
- Documentation names Lists, pagination, bulk deletion behavior, and the one-draft limit accurately.

- [ ] **Step 1: Replace shipped Source language and stale lead limitations**

Document multi-list contacts, list-aware CSV import, and the fact that deletion keeps completed campaign audit rows.

- [ ] **Step 2: Run keyword and public-tree checks**

Run: `rg -n "source filtering|source list|Sources|All sources|lead editing, selective deletion" README.md docs src tests`

Expected: no stale user-facing Source terminology. Variable names related to CSV source rows are allowed.

- [ ] **Step 3: Run the complete release check**

Run: `npm run check`

Expected: scanner, lint, typecheck, all tests, and production build pass.

- [ ] **Step 4: Perform focused browser QA**

Check the floating logo at narrow and wide widths, import into a new and existing list, paginate more than 50 contacts, run each bulk action, refresh a campaign draft, and save a list-targeted campaign.

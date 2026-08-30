# Lists and lead management design

Date: 2026-08-30
Status: Approved for implementation

## Summary

TinyMails will replace the single-source contact model with first-class Lists. A contact remains unique by normalized email address and may belong to any number of lists. CSV imports can create a list or add contacts to an existing list. Campaigns can target an existing list or import a CSV into a list without leaving the composer.

The Leads page will move to server-paginated results with 50 rows per page. Users can select a page or every contact matching the current filters, then add the selection to another list, remove it from the active list, or delete it from the contact library.

TinyMails will continue to support one browser-local campaign draft at a time for v0.1. The supplied TinyMails logo will become the first item in the floating navigation and the browser favicon.

## Data model

Lists are stored in `lists.json`:

```ts
interface ContactList {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}
```

Contacts remain stored in `leads.json`, with membership replacing the old `source` field:

```ts
interface Lead extends ContactInput {
  listIds: string[]
  addedAt: string
}
```

Email remains the contact's unique key. Importing a known email enriches missing profile fields and adds the target list ID without creating a duplicate. List names are trimmed and unique without regard to case.

## Legacy migration

Startup detects lead records that contain `source` and no `listIds`. It creates one list for every distinct legacy source and assigns each contact to the matching list. Blank source values use an `Imported contacts` fallback.

The migration is restart-safe:

1. Reuse an existing list with the same case-insensitive name.
2. Write any missing list records.
3. Replace legacy lead records with `listIds` and write `leads.json` atomically.

The reader accepts legacy records during migration, but all subsequent writes use the new schema. Backup export includes `lists` alongside leads. Credentials remain excluded.

## API design

`GET /api/lists` returns list metadata and current contact counts.

`POST /api/leads/import` accepts one target:

```ts
{
  target: { listId: string } | { listName: string },
  leads: ContactInput[]
}
```

If `listName` matches an existing list without regard to case, the import reuses it. Otherwise the server creates a new list.

`GET /api/leads` accepts `page`, `pageSize`, `query`, `listId`, and `status`. The server caps `pageSize` at 100 and the interface uses 50. The response contains the current page, total matches, page count, status counts, and lists. Existing availability rules still derive contact status from campaigns and suppression data.

Bulk changes use one endpoint with either explicit emails or the current filter:

```ts
{
  selection:
    | { mode: "emails", emails: string[] }
    | {
        mode: "filter"
        query?: string
        listId?: string
        status?: LeadStatus
        excludedEmails?: string[]
      },
  operation:
    | { type: "add-to-list", listId: string }
    | { type: "remove-from-list", listId: string }
    | { type: "delete" }
}
```

The server resolves filter selections again at mutation time. This avoids sending thousands of email addresses from the browser and makes `Select all filtered` work with large local datasets.

Removing from a list only removes that membership. A contact with no remaining memberships stays in the contact library under `All contacts` until explicitly deleted. Delete removes the contact from `leads.json`, every list membership, and unsent campaign recipients. Completed and failed delivery records remain in campaign history as an audit record. Active in-flight deliveries cannot be deleted until their send attempt finishes.

## Leads interface

The Leads page defaults to `All contacts` and shows 50 rows per page. Search, list, and status filters run through the API and reset the page to one.

Each row has a checkbox. The table header selects the current page. After selecting a page, a second action offers to select every contact matching the current filters. The selection bar shows the exact scope and provides:

- Add to list
- Remove from current list, available only when a list filter is active
- Delete contacts

Add opens a list picker. Remove and Delete require confirmation and show the affected count. Delete copy states that prior send history remains.

Lists replace Sources throughout the page. CSV import asks the user to choose an existing list or enter a new list name before saving the reviewed contacts.

## Campaign recipients

Step one starts with two choices:

- Choose an existing list
- Upload a CSV

Choosing a list loads available contacts from that list. The composer can select individual contacts or all available contacts in the list. Uploading a CSV uses the shared import panel, requires an existing or new list, imports the contacts, selects that list, and refreshes the available recipients.

Campaign drafts store `listId` instead of `source`. A compatibility reader ignores a legacy draft's source filter and keeps the rest of the draft. TinyMails continues to allow one active browser-local draft. While it exists, the Campaigns page shows Resume and Discard instead of New campaign.

## Logo and favicon

The supplied transparent PNG becomes a checked-in brand asset. The floating navigation displays it as its first item at a small, legible size with accessible text. Campaigns, Leads, and Settings follow it in the same pill.

The same artwork is exported to favicon-sized assets and linked from `index.html`. No separate logo remains below the navigation.

## Error handling

- A deleted or missing list produces a clear refresh-and-choose-another-list message.
- Removing contacts from a list is idempotent.
- Adding contacts already in a list reports them as unchanged.
- Bulk deletion refuses recipients with an in-flight send and reports how many were skipped.
- Import validation remains client-side before the server receives contact data.
- Page numbers past the final page return the final available page rather than an empty, stranded view.

## Test coverage

Tests will cover:

- Legacy source migration and restart safety
- Multiple list membership with global email deduplication
- Existing-list and new-list CSV imports
- Case-insensitive list-name reuse
- Lead search, list filtering, status filtering, and pagination boundaries
- Page selection and select-all-filtered payloads
- Bulk add, remove, and permanent lead deletion
- Preservation of completed history and removal from unsent queues
- Campaign list targeting and inline CSV import
- One-draft Campaigns behavior
- Logo placement and favicon metadata

## Out of scope

- Dynamic rule-based segments
- More than one active campaign draft
- List sharing, hosted synchronization, or team access
- Contact editing and list renaming
- Deleting completed campaign audit history as part of lead deletion

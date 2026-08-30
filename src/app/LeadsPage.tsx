import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ListMinus,
  ListPlus,
  Search,
  ShieldOff,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleSurface } from "../components/squircle-card";
import type {
  AppApi,
  BulkLeadOperation,
  BulkLeadSelection,
  LeadsResponse,
} from "./api";
import { PageFrame } from "./CampaignsPage";
import { CsvImportPanel } from "./CsvImportPanel";

const PAGE_SIZE = 50;

type BulkAction = "add" | "remove" | "delete";

export function LeadsPage({ api }: { api: AppApi }) {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [listId, setListId] = useState("");
  const [status, setStatus] = useState<"" | "new" | "queued" | "contacted" | "do-not-contact">("");
  const [error, setError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [suppressing, setSuppressing] = useState<string | null>(null);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [excludedEmails, setExcludedEmails] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [targetListId, setTargetListId] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [importNotice, setImportNotice] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    void api.getLeads({ page, pageSize: PAGE_SIZE, query, listId, status }).then((response) => {
      if (!active) return;
      setData(response);
      if (response.pagination.page !== page) setPage(response.pagination.page);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [api, listId, page, query, refreshVersion, status]);

  useEffect(() => {
    if (!importNotice) return;
    const timeout = window.setTimeout(() => setImportNotice(false), 4_000);
    return () => window.clearTimeout(timeout);
  }, [importNotice]);

  const activeList = data?.lists.find((list) => list.id === listId);
  const selectedCount = allFiltered
    ? Math.max(0, (data?.pagination.total ?? 0) - excludedEmails.size)
    : selectedEmails.size;
  const pageEmails = useMemo(() => data?.leads.map((lead) => lead.email) ?? [], [data]);
  const pageSelected = pageEmails.length > 0 && pageEmails.every((email) => isSelected(email));
  const canSelectEveryMatch = !allFiltered
    && pageEmails.length > 0
    && pageSelected
    && (data?.pagination.total ?? 0) > pageEmails.length;

  function isSelected(email: string): boolean {
    return allFiltered ? !excludedEmails.has(email) : selectedEmails.has(email);
  }

  function resetSelection(): void {
    setSelectedEmails(new Set());
    setAllFiltered(false);
    setExcludedEmails(new Set());
    setBulkAction(null);
  }

  function changeFilters(change: () => void): void {
    change();
    setPage(1);
    resetSelection();
  }

  function toggleEmail(email: string): void {
    if (allFiltered) {
      setExcludedEmails((current) => toggled(current, email));
    } else {
      setSelectedEmails((current) => toggled(current, email));
    }
  }

  function togglePage(): void {
    if (allFiltered) {
      setExcludedEmails((current) => {
        const next = new Set(current);
        for (const email of pageEmails) {
          if (pageSelected) next.add(email);
          else next.delete(email);
        }
        return next;
      });
      return;
    }
    setSelectedEmails((current) => {
      const next = new Set(current);
      for (const email of pageEmails) {
        if (pageSelected) next.delete(email);
        else next.add(email);
      }
      return next;
    });
  }

  function selectionPayload(): BulkLeadSelection {
    if (allFiltered) {
      return {
        mode: "filter",
        query,
        listId,
        status,
        excludedEmails: [...excludedEmails],
      };
    }
    return { mode: "emails", emails: [...selectedEmails] };
  }

  async function applyBulk(operation: BulkLeadOperation): Promise<void> {
    setBulkWorking(true);
    setStatusMessage(null);
    const targetName = "listId" in operation
      ? data?.lists.find((list) => list.id === operation.listId)?.name
      : undefined;
    try {
      const result = await api.bulkUpdateLeads(selectionPayload(), operation);
      if (operation.type === "add-to-list") {
        setStatusMessage(`${result.affected} contacts added to ${targetName ?? "the list"}.`);
      } else if (operation.type === "remove-from-list") {
        setStatusMessage(`${result.affected} contacts removed from ${targetName ?? "the list"}.`);
      } else {
        const skipped = result.skipped > 0 ? ` ${result.skipped} in-flight contacts were skipped.` : "";
        setStatusMessage(`${result.affected} contacts deleted.${skipped}`);
      }
      resetSelection();
      setRefreshVersion((version) => version + 1);
    } catch (bulkError) {
      setStatusMessage(bulkError instanceof Error ? bulkError.message : "The selected contacts could not be updated.");
    } finally {
      setBulkWorking(false);
    }
  }

  async function suppress(email: string): Promise<void> {
    setSuppressing(email);
    setStatusMessage(null);
    try {
      await api.suppressEmails([email]);
      setStatusMessage(`${email} added to do-not-contact.`);
      setRefreshVersion((version) => version + 1);
    } catch (suppressError) {
      setStatusMessage(suppressError instanceof Error ? suppressError.message : "The address could not be suppressed.");
    } finally {
      setSuppressing(null);
    }
  }

  return (
    <PageFrame
      title="Leads"
      description="Organize permission-based contacts into lists and manage their campaign status."
    >
      {error ? <NoticeStrip claim="Leads are unavailable.">Check that the local service is running.</NoticeStrip> : null}
      {statusMessage ? <NoticeStrip claim="Leads updated">{statusMessage}</NoticeStrip> : null}
      {importOpen && data ? (
        <CsvImportPanel
          api={api}
          lists={data.lists}
          defaultListId={listId || undefined}
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setRefreshVersion((version) => version + 1);
            setImportNotice(true);
          }}
        />
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => changeFilters(() => setQuery(event.target.value))}
            placeholder="Search name, company, or email"
            className="h-9 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label>
          <span className="sr-only">Filter by list</span>
          <select
            aria-label="Filter by list"
            value={listId}
            onChange={(event) => changeFilters(() => setListId(event.target.value))}
            className="h-9 min-w-44 rounded-lg border border-input bg-card px-3 text-sm outline-none"
          >
            <option value="">All contacts</option>
            {data?.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => changeFilters(() => setStatus(event.target.value as typeof status))}
            className="h-9 min-w-40 rounded-lg border border-input bg-card px-3 text-sm outline-none"
          >
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="queued">Queued</option>
            <option value="contacted">Contacted</option>
            <option value="do-not-contact">Do not contact</option>
          </select>
        </label>
        <Button variant="secondary" onClick={() => setImportOpen((open) => !open)}>
          <Upload className="size-4" aria-hidden="true" /> Import CSV
        </Button>
      </div>

      {selectedCount > 0 ? (
        <SquircleSurface className="border border-primary/25 bg-primary/[0.04] px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{selectedCount} {selectedCount === 1 ? "contact" : "contacts"} selected</p>
              {canSelectEveryMatch ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-1"
                  onClick={() => { setAllFiltered(true); setSelectedEmails(new Set()); }}
                  aria-label={`Select all ${data?.pagination.total ?? 0} matching contacts`}
                >
                  Select all {data?.pagination.total ?? 0} matching contacts
                </Button>
              ) : allFiltered ? (
                <p className="mt-1 text-xs text-muted-foreground">Every contact matching the current filters is selected.</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => { setBulkAction("add"); setTargetListId(""); }}>
                <ListPlus className="size-4" aria-hidden="true" /> Add to list
              </Button>
              {activeList ? (
                <Button variant="secondary" size="sm" onClick={() => setBulkAction("remove")}>
                  <ListMinus className="size-4" aria-hidden="true" /> Remove from {activeList.name}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setBulkAction("delete")}>
                <Trash2 className="size-4" aria-hidden="true" /> Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={resetSelection} aria-label="Clear selection">
                <X className="size-4" aria-hidden="true" /> Clear
              </Button>
            </div>
          </div>
          {bulkAction ? (
            <BulkConfirmation
              action={bulkAction}
              count={selectedCount}
              lists={data?.lists ?? []}
              activeListName={activeList?.name}
              targetListId={targetListId}
              setTargetListId={setTargetListId}
              working={bulkWorking}
              onCancel={() => setBulkAction(null)}
              onConfirm={() => {
                if (bulkAction === "add" && targetListId) {
                  void applyBulk({ type: "add-to-list", listId: targetListId });
                } else if (bulkAction === "remove" && listId) {
                  void applyBulk({ type: "remove-from-list", listId });
                } else if (bulkAction === "delete") {
                  void applyBulk({ type: "delete" });
                }
              }}
            />
          ) : null}
        </SquircleSurface>
      ) : null}

      <SquircleSurface className="overflow-hidden border border-border shadow-[var(--shadow-resting)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-medium">{activeList?.name ?? "All contacts"}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{data?.pagination.total ?? 0} matching</p>
          </div>
          <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        {data === null ? <div className="h-36 animate-pulse bg-background" aria-label="Loading leads" /> : null}
        {data && data.leads.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">No leads match this view.</p>
        ) : null}
        {data && data.leads.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-background text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="w-12 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={pageSelected}
                      onChange={togglePage}
                      aria-label="Select this page"
                      className="size-4 accent-primary"
                    />
                  </th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Lists</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((lead) => (
                  <tr key={lead.email} className="border-t border-border first:border-t-0 hover:bg-accent">
                    <td className="px-5 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected(lead.email)}
                        onChange={() => toggleEmail(lead.email)}
                        aria-label={`Select ${lead.email}`}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium">{lead.firstName || "Unnamed contact"}</span>
                      <span className="text-xs text-muted-foreground">{lead.email}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company || "Not set"}</td>
                    <td className="max-w-52 px-4 py-3 text-muted-foreground">
                      {listNames(lead.listIds, data.lists) || "No list"}
                    </td>
                    <td className="px-5 py-3 capitalize">{lead.status.replaceAll("-", " ")}</td>
                    <td className="px-5 py-3 text-right">
                      {lead.status !== "do-not-contact" ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          loading={suppressing === lead.email}
                          onClick={() => void suppress(lead.email)}
                          aria-label={`Do not contact ${lead.email}`}
                        >
                          <ShieldOff className="size-3.5" aria-hidden="true" /> Suppress
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data ? (
          <div className="flex items-center justify-between border-t border-border px-5 py-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={data.pagination.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden="true" /> Previous
            </Button>
            <p className="text-xs text-muted-foreground">Page {data.pagination.page} of {data.pagination.pages}</p>
            <Button
              variant="ghost"
              size="sm"
              disabled={data.pagination.page >= data.pagination.pages}
              onClick={() => setPage((current) => current + 1)}
              aria-label="Next page"
            >
              Next <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </SquircleSurface>
      {importNotice ? (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-[var(--shadow-floating)]"
        >
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          Leads imported
        </div>
      ) : null}
    </PageFrame>
  );
}

function BulkConfirmation({
  action,
  count,
  lists,
  activeListName,
  targetListId,
  setTargetListId,
  working,
  onCancel,
  onConfirm,
}: {
  action: BulkAction;
  count: number;
  lists: LeadsResponse["lists"];
  activeListName?: string;
  targetListId: string;
  setTargetListId: (id: string) => void;
  working: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-primary/15 pt-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        {action === "add" ? (
          <label className="text-xs font-medium text-muted-foreground">
            Add selected contacts to
            <select
              aria-label="Add selected contacts to"
              value={targetListId}
              onChange={(event) => setTargetListId(event.target.value)}
              className="mt-1 h-9 w-full max-w-xs rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Choose a list</option>
              {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </label>
        ) : action === "remove" ? (
          <p className="text-sm">Remove {count} {count === 1 ? "contact" : "contacts"} from {activeListName}?</p>
        ) : (
          <div>
            <p className="text-sm font-medium">Delete {count} {count === 1 ? "contact" : "contacts"} from TinyMails?</p>
            <p className="mt-1 text-xs text-muted-foreground">Completed delivery history will remain as an audit record.</p>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          loading={working}
          disabled={action === "add" && !targetListId}
          onClick={onConfirm}
          aria-label={
            action === "add"
              ? "Confirm add to list"
              : action === "remove"
                ? "Confirm remove from list"
                : `Delete ${count} ${count === 1 ? "contact" : "contacts"}`
          }
        >
          {action === "add" ? "Add" : action === "remove" ? "Remove" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

function listNames(listIds: string[], lists: LeadsResponse["lists"]): string {
  return listIds
    .map((id) => lists.find((list) => list.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join(", ");
}

function toggled(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

import { FileCheck2, Upload, X } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "../components/button";
import { SquircleSurface } from "../components/squircle-card";
import {
  CsvParseError,
  defaultLeadMapping,
  parseCsv,
  reviewLeadCsv,
  type CsvTable,
  type LeadColumnMapping,
  type LeadCsvReview,
} from "../domain/csv";
import type { AppApi, ContactListSummary, ImportLeadsResponse } from "./api";

export function CsvImportPanel({
  api,
  lists,
  defaultListId,
  onClose,
  onImported,
}: {
  api: AppApi;
  lists: ContactListSummary[];
  defaultListId?: string;
  onClose: () => void;
  onImported: (result: ImportLeadsResponse) => Promise<void> | void;
}) {
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<LeadColumnMapping>({});
  const [listChoice, setListChoice] = useState(defaultListId || lists[0]?.id || "new");
  const [newListName, setNewListName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const review = useMemo(() => safeReview(table, mapping), [mapping, table]);

  async function chooseCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      setMessage("That CSV is larger than the 5 MB local import limit.");
      return;
    }
    try {
      const parsed = parseCsv(await readText(file));
      const detected = defaultLeadMapping(parsed.headers);
      setTable(parsed);
      setMapping(detected);
      if (listChoice === "new") setNewListName(file.name.replace(/\.csv$/i, "") || "CSV import");
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "TinyMails could not read that CSV.");
    }
  }

  async function importRows() {
    const target = listChoice === "new"
      ? { listName: newListName.trim() }
      : { listId: listChoice };
    if (!review || !("listId" in target || target.listName) || review.contacts.length === 0) return;
    setImporting(true);
    setMessage(null);
    try {
      const result = await api.importLeads(target, review.contacts);
      await onImported(result);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The leads could not be imported.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <SquircleSurface className="border border-border p-5 shadow-[var(--shadow-resting)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em]">Review a CSV import</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nothing is saved until you confirm the reviewed rows.</p>
        </div>
        <Button variant="ghost" size="xs" onClick={onClose} aria-label="Close import">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          CSV file
          <input
            aria-label="CSV file"
            type="file"
            accept="text/csv,.csv"
            onChange={(event) => void chooseCsv(event)}
            className="mt-1 block h-9 w-full rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium"
          />
        </label>
        <label className="flex-1 text-xs font-medium text-muted-foreground">
          List
          <select
            aria-label="Import contacts into"
            value={listChoice}
            onChange={(event) => setListChoice(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          >
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            <option value="new">Create new list</option>
          </select>
        </label>
      </div>

      {listChoice === "new" ? (
        <label className="mt-3 block text-xs font-medium text-muted-foreground">
          New list name
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            placeholder="Community list"
          />
        </label>
      ) : null}

      {table ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ColumnSelect label="Email" required table={table} value={mapping.email} onChange={(email) => setMapping({ ...mapping, email })} />
          <ColumnSelect label="First name" table={table} value={mapping.firstName} onChange={(firstName) => setMapping({ ...mapping, firstName })} />
          <ColumnSelect label="Company" table={table} value={mapping.company} onChange={(company) => setMapping({ ...mapping, company })} />
        </div>
      ) : null}

      {review ? <ReviewSummary review={review} /> : null}
      {message ? <p role="status" className="mt-4 text-sm font-medium">{message}</p> : null}
      <div className="mt-5 flex justify-end">
        <Button
          loading={importing}
          disabled={
            !review
            || review.contacts.length === 0
            || (listChoice === "new" ? !newListName.trim() : !listChoice)
          }
          onClick={() => void importRows()}
          aria-label={`Import ${review?.contacts.length ?? 0} leads`}
        >
          <Upload className="size-4" aria-hidden="true" /> Import {review?.contacts.length ?? 0} leads
        </Button>
      </div>
    </SquircleSurface>
  );
}

function ColumnSelect({
  label,
  required = false,
  table,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  table: CsvTable;
  value?: number;
  onChange: (index?: number) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}{required ? " *" : ""}
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
        className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
      >
        <option value="">Not mapped</option>
        {table.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}
      </select>
    </label>
  );
}

function ReviewSummary({ review }: { review: LeadCsvReview }) {
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border px-4 py-3 text-sm">
        <span className="font-medium text-success">{review.counts.valid} ready</span>
        <span className="text-muted-foreground">{review.counts.invalid} invalid</span>
        <span className="text-muted-foreground">{review.counts.duplicate} duplicate</span>
      </div>
      <div className="divide-y divide-border">
        {review.rows.slice(0, 6).map((row) => (
          <div key={`${row.line}-${row.contact?.email ?? row.issue}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
            <span className="truncate">{row.contact?.email ?? `Line ${row.line}`}</span>
            <span className="shrink-0 text-muted-foreground">{row.issue ?? <FileCheck2 className="size-3.5 text-success" aria-label="Ready" />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function safeReview(table: CsvTable | null, mapping: LeadColumnMapping): LeadCsvReview | null {
  if (!table || mapping.email === undefined) return null;
  try {
    return reviewLeadCsv(table, mapping);
  } catch (error) {
    if (error instanceof CsvParseError) return null;
    throw error;
  }
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("TinyMails could not read that CSV.")), { once: true });
    reader.readAsText(file);
  });
}

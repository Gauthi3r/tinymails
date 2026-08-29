import { Search, Upload, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleSurface } from "../components/squircle-card";
import type { AppApi, LeadsResponse } from "./api";
import { PageFrame } from "./CampaignsPage";
import { CsvImportPanel } from "./CsvImportPanel";

export function LeadsPage({ api }: { api: AppApi }) {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    setData(await api.getLeads());
  }

  useEffect(() => {
    let active = true;
    void api.getLeads().then((response) => {
      if (active) setData(response);
    }).catch(() => {
      if (active) setError(true);
    });
    return () => { active = false; };
  }, [api]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.leads ?? []).filter(
      (lead) =>
        (!source || lead.source === source) &&
        (!normalizedQuery ||
          lead.email.includes(normalizedQuery) ||
          lead.firstName?.toLowerCase().includes(normalizedQuery) ||
          lead.company?.toLowerCase().includes(normalizedQuery)),
    );
  }, [data, query, source]);

  return (
    <PageFrame
      eyebrow="Contact library"
      title="Leads"
      description="Status is derived from real campaign history and the do-not-contact list."
    >
      {error ? <NoticeStrip claim="Leads are unavailable.">Check that the local service is running.</NoticeStrip> : null}
      {importOpen ? <CsvImportPanel api={api} onClose={() => setImportOpen(false)} onImported={refresh} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, company, or email"
            className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label>
          <span className="sr-only">Filter by source</span>
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="h-9 min-w-44 rounded-lg border border-input bg-card px-3 text-sm outline-none"
          >
            <option value="">All sources</option>
            {data?.sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <Button variant="secondary" onClick={() => setImportOpen((open) => !open)}>
          <Upload className="size-4" aria-hidden="true" /> Import CSV
        </Button>
      </div>
      <SquircleSurface className="overflow-hidden border border-border shadow-[var(--shadow-resting)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-medium">Contact library</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{data?.counts.total ?? 0} total</p>
          </div>
          <UsersRound className="size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        {data === null ? <div className="h-36 animate-pulse bg-background" aria-label="Loading leads" /> : null}
        {data && filtered.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">No leads match this view.</p>
        ) : null}
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-sm">
              <thead className="bg-background text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
                  <tr key={lead.email} className="border-t border-border first:border-t-0 hover:bg-accent">
                    <td className="px-5 py-3">
                      <span className="block font-medium">{lead.firstName || "Unnamed contact"}</span>
                      <span className="text-xs text-muted-foreground">{lead.email}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.company || "Not set"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{lead.source}</td>
                    <td className="px-5 py-3 capitalize">{lead.status.replaceAll("-", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SquircleSurface>
    </PageFrame>
  );
}

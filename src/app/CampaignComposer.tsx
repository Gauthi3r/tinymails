import { Check, ChevronLeft, ChevronRight, Play, Send, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleSurface } from "../components/squircle-card";
import { renderMessage } from "../domain/personalization";
import type { Campaign, Template } from "../domain/types";
import type { AppApi, ImportLeadsResponse, LeadsResponse, LeadView, PublicAccount, SettingsResponse } from "./api";
import { clearCampaignDraft, saveCampaignDraft, type CampaignDraft } from "./campaign-draft";
import { CsvImportPanel } from "./CsvImportPanel";

const steps = ["Recipients", "Write", "Delivery", "Review"] as const;

export function CampaignComposer({
  api,
  initialDraft,
  onCancel,
  onCreated,
  onSaved,
  onDraftChange,
}: {
  api: AppApi;
  initialDraft: CampaignDraft | null;
  onCancel: () => void;
  onCreated: (campaign: Campaign) => void;
  onSaved: (campaign: Campaign) => void;
  onDraftChange: (draft: CampaignDraft | null) => void;
}) {
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [contactCache, setContactCache] = useState<Map<string, LeadView>>(new Map());
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(initialDraft?.step ?? 0);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set(initialDraft?.selectedEmails));
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set(initialDraft?.selectedAccounts));
  const [listId, setListId] = useState(initialDraft?.listId ?? "");
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [body, setBody] = useState(initialDraft?.body ?? "");
  const [dailyCap, setDailyCap] = useState(initialDraft?.dailyCap ?? 25);
  const [delayMin, setDelayMin] = useState(initialDraft?.delayMin ?? 30);
  const [delayMax, setDelayMax] = useState(initialDraft?.delayMax ?? 45);
  const [importOpen, setImportOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  const [savedCampaign, setSavedCampaign] = useState<Campaign | null>(null);
  const shouldDefaultAccount = useRef(initialDraft === null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.getLeads({ page: 1, pageSize: 100, ...(listId ? { listId } : {}) }),
      api.getSettings(),
      api.getTemplates(),
    ]).then(([leadData, settingsData, templateData]) => {
      if (!active) return;
      setLeads(leadData);
      cacheContacts(leadData.leads);
      if (!listId && leadData.lists[0]) setListId(leadData.lists[0].id);
      setSettings(settingsData);
      setTemplates(templateData);
      if (shouldDefaultAccount.current) {
        setSelectedAccounts(new Set(settingsData.accounts.slice(0, 1).map((account) => account.id)));
      }
    }).catch(() => {
      if (active) setMessage("TinyMails could not load leads and delivery settings.");
    });
    return () => { active = false; };
  }, [api, listId]);

  useEffect(() => {
    const draft: CampaignDraft = {
      version: 2,
      step,
      selectedEmails: [...selectedEmails],
      selectedAccounts: [...selectedAccounts],
      listId,
      name,
      subject,
      body,
      dailyCap,
      delayMin,
      delayMax,
      updatedAt: new Date().toISOString(),
    };
    saveCampaignDraft(window.localStorage, draft);
    onDraftChange(draft);
  }, [body, dailyCap, delayMax, delayMin, listId, name, onDraftChange, selectedAccounts, selectedEmails, step, subject]);

  const available = useMemo(
    () => (leads?.leads ?? []).filter((lead) => lead.status === "new" && (!listId || lead.listIds.includes(listId))),
    [leads, listId],
  );
  const selected = useMemo(
    () => [...selectedEmails]
      .map((email) => contactCache.get(email))
      .filter((lead): lead is LeadView => Boolean(lead && lead.status === "new")),
    [contactCache, selectedEmails],
  );
  const accounts = settings?.accounts ?? [];
  const selectedAccountRecords = accounts.filter((account) => selectedAccounts.has(account.id));
  const canContinue =
    (step === 0 && selected.length > 0) ||
    (step === 1 && Boolean(name.trim() && subject.trim() && body.trim())) ||
    (step === 2 && selectedAccounts.size > 0 && dailyCap > 0 && delayMin >= 0 && delayMax >= delayMin) ||
    step === 3;

  function toggleEmail(email: string) {
    setSelectedEmails((current) => toggled(current, email));
  }

  function toggleAccount(account: PublicAccount) {
    setSelectedAccounts((current) => toggled(current, account.id));
  }

  function cacheContacts(contacts: LeadView[]): void {
    setContactCache((current) => {
      const next = new Map(current);
      for (const contact of contacts) next.set(contact.email, contact);
      return next;
    });
  }

  async function selectAllAvailable(): Promise<void> {
    if (!listId) return;
    setSelectedEmails(new Set(available.map((lead) => lead.email)));
    setSelectingAll(true);
    setMessage(null);
    try {
      const first = await api.getLeads({ page: 1, pageSize: 100, listId, status: "new" });
      const contacts = [...first.leads];
      for (let page = 2; page <= first.pagination.pages; page += 1) {
        const next = await api.getLeads({ page, pageSize: 100, listId, status: "new" });
        contacts.push(...next.leads);
      }
      const availableContacts = contacts.filter((lead) => lead.status === "new");
      cacheContacts(availableContacts);
      setSelectedEmails(new Set(availableContacts.map((lead) => lead.email)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The list could not be selected.");
    } finally {
      setSelectingAll(false);
    }
  }

  async function refreshLeads(preferredListId: string = listId) {
    const refreshed = await api.getLeads({
      page: 1,
      pageSize: 100,
      listId: preferredListId,
    });
    setLeads(refreshed);
    cacheContacts(refreshed.leads);
    setListId(preferredListId || refreshed.lists[0]?.id || "");
  }

  function finishDraft() {
    clearCampaignDraft(window.localStorage);
    onDraftChange(null);
  }

  async function ensureSaved(): Promise<Campaign> {
    if (savedCampaign) return savedCampaign;
    const result = await api.createCampaign({
      name: name.trim(),
      subject,
      body,
      accountIds: [...selectedAccounts],
      dailyCap,
      delayMinSeconds: delayMin,
      delayMaxSeconds: delayMax,
      recipients: selected.map(({ email, firstName, company }) => ({ email, firstName, company })),
    });
    finishDraft();
    setSavedCampaign(result.campaign);
    onSaved(result.campaign);
    if (result.excluded.length > 0) {
      setMessage(
        `${result.excluded.length} recipient${result.excluded.length === 1 ? " was" : "s were"} excluded by the final safety checks. The campaign has ${result.campaign.recipients.length} recipient${result.campaign.recipients.length === 1 ? "" : "s"}.`,
      );
    }
    return result.campaign;
  }

  async function sendPreview() {
    setTesting(true);
    setMessage(null);
    try {
      const campaign = await ensureSaved();
      const tested = await api.testCampaign(campaign.id);
      setSavedCampaign(tested);
      onSaved(tested);
      const inboxes = selectedAccountRecords.map((account) => account.email).join(", ") || "your Gmail inbox";
      const confirmation = `Test sent to ${inboxes}. Check that inbox, then press Start.`;
      setMessage((current) => (current ? `${current} ${confirmation}` : confirmation));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The test email could not be sent.");
    } finally {
      setTesting(false);
    }
  }

  async function start() {
    if (!savedCampaign) return;
    setStarting(true);
    setMessage(null);
    try {
      const running = await api.startCampaign(savedCampaign.id);
      onCreated(running);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The campaign could not be started.");
    } finally {
      setStarting(false);
    }
  }

  async function saveTemplate() {
    if (!name.trim() || !subject.trim() || !body.trim()) return;
    try {
      const template = await api.saveTemplate({ name: name.trim(), subject, body });
      setTemplates((current) => [template, ...current]);
      setMessage(`Template “${template.name}” saved.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The template could not be saved.");
    }
  }

  return (
    <SquircleSurface
      role="region"
      aria-label="Campaign composer"
      className="h-full min-h-0 overflow-hidden border border-border shadow-[var(--shadow-resting)]"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">New campaign</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.025em]">{steps[step]}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Close campaign composer">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-4 border-b border-border bg-background px-3 sm:px-5">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => { if (index < step && !savedCampaign) setStep(index as 0 | 1 | 2 | 3); }}
            disabled={index > step || (index < step && Boolean(savedCampaign))}
            className="flex min-h-12 items-center justify-center gap-1.5 border-b-2 border-transparent px-1 text-xs font-medium text-muted-foreground disabled:opacity-45 data-[active=true]:border-primary data-[active=true]:text-foreground sm:text-sm"
            data-active={index === step}
          >
            <span className="hidden size-5 place-items-center rounded-full bg-secondary text-[11px] sm:grid">
              {index < step ? <Check className="size-3" aria-hidden="true" /> : index + 1}
            </span>
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-card p-5 sm:p-7">
        {message ? <NoticeStrip claim="Campaign">{message}</NoticeStrip> : null}
        {step === 0 ? (
          <RecipientsStep
            api={api}
            data={leads}
            available={available}
            selected={selectedEmails}
            listId={listId}
            importOpen={importOpen}
            setListId={setListId}
            setImportOpen={setImportOpen}
            toggleEmail={toggleEmail}
            refreshLeads={refreshLeads}
            selectingAll={selectingAll}
            selectAllAvailable={() => void selectAllAvailable()}
          />
        ) : null}
        {step === 1 ? (
          <WriteStep
            name={name}
            subject={subject}
            body={body}
            templates={templates}
            setName={setName}
            setSubject={setSubject}
            setBody={setBody}
            onSaveTemplate={() => void saveTemplate()}
          />
        ) : null}
        {step === 2 ? (
          <DeliveryStep
            accounts={accounts}
            selected={selectedAccounts}
            toggleAccount={toggleAccount}
            dailyCap={dailyCap}
            delayMin={delayMin}
            delayMax={delayMax}
            setDailyCap={setDailyCap}
            setDelayMin={setDelayMin}
            setDelayMax={setDelayMax}
          />
        ) : null}
        {step === 3 ? (
          <ReviewStep
            recipients={selected}
            accounts={selectedAccountRecords}
            subject={subject}
            body={body}
            dailyCap={dailyCap}
            delayMin={delayMin}
            delayMax={delayMax}
          />
        ) : null}
      </div>

      <div
        role="group"
        aria-label="Campaign composer actions"
        className="flex shrink-0 items-center justify-between border-t border-border bg-background px-5 py-4"
      >
        <Button variant="ghost" disabled={step === 0 || Boolean(savedCampaign)} onClick={() => setStep((current) => Math.max(0, current - 1) as 0 | 1 | 2 | 3)}>
          <ChevronLeft className="size-4" aria-hidden="true" /> Back
        </Button>
        {step < 3 ? (
          <Button disabled={!canContinue} onClick={() => setStep((current) => Math.min(3, current + 1) as 0 | 1 | 2 | 3)} aria-label={`Continue to ${steps[step + 1]}`}>
            Continue <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <span className="flex items-center gap-2">
            <Button variant="secondary" loading={testing} disabled={starting} onClick={() => void sendPreview()} aria-label="Send test email">
              <Send className="size-4" aria-hidden="true" /> {savedCampaign?.testedAt ? "Send test again" : "Send test"}
            </Button>
            <Button loading={starting} disabled={!savedCampaign?.testedAt || testing} onClick={() => void start()} aria-label="Start campaign">
              <Play className="size-4" aria-hidden="true" /> Start
            </Button>
          </span>
        )}
      </div>
    </SquircleSurface>
  );
}

function RecipientsStep({
  api,
  data,
  available,
  selected,
  listId,
  importOpen,
  setListId,
  setImportOpen,
  toggleEmail,
  selectingAll,
  selectAllAvailable,
  refreshLeads,
}: {
  api: AppApi;
  data: LeadsResponse | null;
  available: LeadsResponse["leads"];
  selected: Set<string>;
  listId: string;
  importOpen: boolean;
  setListId: (listId: string) => void;
  setImportOpen: (open: boolean) => void;
  toggleEmail: (email: string) => void;
  selectingAll: boolean;
  selectAllAvailable: () => void;
  refreshLeads: (listId?: string) => Promise<void>;
}) {
  const selectedCount = selected.size;
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">{selectedCount} available leads selected</p>
        </div>
        <div className="flex flex-wrap items-end gap-2 sm:justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={selectAllAvailable}
            loading={selectingAll}
            disabled={available.length === 0}
          >
            Select all available
          </Button>
          <label className="text-xs font-medium text-muted-foreground">
            Existing list
            <select
              aria-label="Recipient list"
              value={listId}
              onChange={(event) => {
                setListId(event.target.value);
                void refreshLeads(event.target.value);
              }}
              className="ml-2 h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              {data?.lists.length ? null : <option value="">No lists yet</option>}
              {data?.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
            </select>
          </label>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(!importOpen)}>
            <Upload className="size-4" aria-hidden="true" /> Upload CSV
          </Button>
        </div>
      </div>
      {importOpen ? (
        <div className="mt-4">
          <CsvImportPanel
            api={api}
            lists={data?.lists ?? []}
            defaultListId={listId || undefined}
            onClose={() => setImportOpen(false)}
            onImported={async (result: ImportLeadsResponse) => {
              await refreshLeads(result.list.id);
            }}
          />
        </div>
      ) : null}
      {data && data.leads.some((lead) => lead.status !== "new") ? (
        <p className="mt-4 rounded-xl bg-secondary px-4 py-3 text-xs text-muted-foreground">
          {data.leads.filter((lead) => lead.status !== "new").length} contacted, queued, bounced, or suppressed leads are unavailable.
        </p>
      ) : null}
      <div className="mt-4 max-h-72 divide-y divide-border overflow-auto rounded-xl border border-border bg-background">
        {available.map((lead) => (
          <label key={lead.email} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-accent">
            <input type="checkbox" checked={selected.has(lead.email)} onChange={() => toggleEmail(lead.email)} className="size-4 accent-primary" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{lead.firstName || lead.email}</span>
              <span className="block truncate text-xs text-muted-foreground">{lead.email}{lead.company ? ` · ${lead.company}` : ""}</span>
            </span>
          </label>
        ))}
        {data && available.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No new leads in this list.</p> : null}
      </div>
    </div>
  );
}

function WriteStep({ name, subject, body, templates, setName, setSubject, setBody, onSaveTemplate }: {
  name: string; subject: string; body: string;
  templates: Template[];
  setName: (value: string) => void; setSubject: (value: string) => void; setBody: (value: string) => void;
  onSaveTemplate: () => void;
}) {
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const activeField = useRef<"subject" | "body">("body");

  function insertVariable(variable: "{firstName}" | "{company}") {
    const fieldName = activeField.current;
    const field = fieldName === "subject" ? subjectRef.current : bodyRef.current;
    const value = fieldName === "subject" ? subject : body;
    const start = field?.selectionStart ?? value.length;
    const end = field?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${variable}${value.slice(end)}`;
    const caret = start + variable.length;
    if (fieldName === "subject") setSubject(next); else setBody(next);
    field?.focus();
    window.requestAnimationFrame(() => {
      field?.setSelectionRange(caret, caret);
    });
  }

  return (
    <div>
      <div className="grid gap-4">
        {templates.length > 0 ? (
          <label className="text-xs font-medium text-muted-foreground">
            Saved template
            <select
              aria-label="Saved template"
              defaultValue=""
              onChange={(event) => {
                const template = templates.find((item) => item.id === event.target.value);
                if (template) {
                  setSubject(template.subject);
                  setBody(template.body);
                }
              }}
              className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
            >
              <option value="">Choose a template</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
          </label>
        ) : null}
        <TextField label="Campaign name" value={name} onChange={setName} placeholder="September beta note" />
        <label className="text-xs font-medium text-muted-foreground">
          Subject
          <input
            ref={subjectRef}
            aria-label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            onFocus={() => { activeField.current = "subject"; }}
            placeholder="A short note for your company"
            className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Personalization variables">
          <span className="mr-1 text-xs font-medium text-muted-foreground">Insert variable</span>
          <Button variant="secondary" size="xs" onClick={() => insertVariable("{firstName}")} aria-label="Insert {firstName}">
            <code className="font-mono">{"{firstName}"}</code>
          </Button>
          <Button variant="secondary" size="xs" onClick={() => insertVariable("{company}")} aria-label="Insert {company}">
            <code className="font-mono">{"{company}"}</code>
          </Button>
        </div>
        <label className="text-xs font-medium text-muted-foreground">
          Message
          <textarea
            ref={bodyRef}
            aria-label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onFocus={() => { activeField.current = "body"; }}
            rows={9}
            placeholder="Write your message"
            className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground"
          />
        </label>
        <div><Button variant="secondary" size="sm" disabled={!name.trim() || !subject.trim() || !body.trim()} onClick={onSaveTemplate}>Save as template</Button></div>
      </div>
    </div>
  );
}

function DeliveryStep({ accounts, selected, toggleAccount, dailyCap, delayMin, delayMax, setDailyCap, setDelayMin, setDelayMax }: {
  accounts: PublicAccount[]; selected: Set<string>; toggleAccount: (account: PublicAccount) => void;
  dailyCap: number; delayMin: number; delayMax: number;
  setDailyCap: (value: number) => void; setDelayMin: (value: number) => void; setDelayMax: (value: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">Sender</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => (
          <label key={account.id} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-background p-4 hover:bg-accent">
            <input type="checkbox" checked={selected.has(account.id)} onChange={() => toggleAccount(account)} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="block text-sm font-medium">{account.email}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{account.lastTestedAt ? "Test send confirmed" : "Test send comes at the review step"} · {account.dailyCap}/day</span>
            </span>
          </label>
        ))}
        {accounts.length === 0 ? <NoticeStrip claim="No Gmail account">Connect Gmail in Settings before saving delivery rules.</NoticeStrip> : null}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <NumberField label="Daily cap" value={dailyCap} min={1} onChange={setDailyCap} />
        <NumberField label="Minimum delay (seconds)" value={delayMin} min={0} onChange={setDelayMin} />
        <NumberField label="Maximum delay (seconds)" value={delayMax} min={delayMin} onChange={setDelayMax} />
      </div>
    </div>
  );
}

function ReviewStep({ recipients, accounts, subject, body, dailyCap, delayMin, delayMax }: {
  recipients: LeadsResponse["leads"]; accounts: PublicAccount[]; subject: string; body: string;
  dailyCap: number; delayMin: number; delayMax: number;
}) {
  const sample = recipients[0];
  return (
    <div>
      <p className="mt-1 text-sm text-muted-foreground">Send the test to your own inbox first. Start unlocks after the test and begins sending immediately.</p>
      <div className="mt-5 grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3 rounded-xl border border-border bg-background p-4 text-sm">
          <ReviewRow label="Recipients" value={`${recipients.length} recipients`} />
          <ReviewRow label="Account" value={accounts.map((account) => account.email).join(", ")} />
          <ReviewRow label="Daily cap" value={String(dailyCap)} />
          <ReviewRow label="Delay" value={`${delayMin}–${delayMax} seconds`} />
          <ReviewRow label="Tracking" value="None" />
        </div>
        <article className="rounded-xl border border-border bg-background p-5">
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground"><Send className="size-3.5" aria-hidden="true" /> Personalized sample</div>
          <p className="text-sm font-semibold">{sample ? renderMessage(subject, sample) : subject}</p>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-foreground/85">{sample ? renderMessage(body, sample) : body}</p>
        </article>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-xs font-medium text-muted-foreground">{label}<input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>;
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return <label className="text-xs font-medium text-muted-foreground">{label}<input type="number" value={value} min={min} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value || "Not set"}</span></div>;
}

function toggled(current: Set<string>, value: string): Set<string> {
  const next = new Set(current);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

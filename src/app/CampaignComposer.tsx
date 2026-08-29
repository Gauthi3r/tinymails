import { Check, ChevronLeft, ChevronRight, Mail, Send, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleSurface } from "../components/squircle-card";
import { renderMessage } from "../domain/personalization";
import type { Campaign, Template } from "../domain/types";
import type { AppApi, LeadsResponse, PublicAccount, SettingsResponse } from "./api";

const steps = ["Recipients", "Write", "Delivery", "Review"] as const;

export function CampaignComposer({
  api,
  onCancel,
  onCreated,
}: {
  api: AppApi;
  onCancel: () => void;
  onCreated: (campaign: Campaign) => void;
}) {
  const [leads, setLeads] = useState<LeadsResponse | null>(null);
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [step, setStep] = useState(0);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [source, setSource] = useState("");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [dailyCap, setDailyCap] = useState(25);
  const [delayMin, setDelayMin] = useState(30);
  const [delayMax, setDelayMax] = useState(45);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([api.getLeads(), api.getSettings(), api.getTemplates()]).then(([leadData, settingsData, templateData]) => {
      if (!active) return;
      setLeads(leadData);
      setSettings(settingsData);
      setTemplates(templateData);
      setSelectedEmails(new Set(leadData.leads.filter((lead) => lead.status === "new").map((lead) => lead.email)));
      setSelectedAccounts(new Set(settingsData.accounts.slice(0, 1).map((account) => account.id)));
    }).catch(() => {
      if (active) setMessage("TinyMails could not load leads and delivery settings.");
    });
    return () => { active = false; };
  }, [api]);

  const available = useMemo(
    () => (leads?.leads ?? []).filter((lead) => lead.status === "new" && (!source || lead.source === source)),
    [leads, source],
  );
  const selected = useMemo(
    () => (leads?.leads ?? []).filter((lead) => selectedEmails.has(lead.email) && lead.status === "new"),
    [leads, selectedEmails],
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

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
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
      onCreated(result.campaign);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The campaign could not be saved.");
    } finally {
      setSaving(false);
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
    <SquircleSurface className="overflow-hidden border border-border shadow-[var(--shadow-resting)]">
      <div className="flex items-center justify-between border-b border-border bg-card px-5 py-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">New campaign</p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-[-0.025em]">{steps[step]}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Close campaign composer">
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-4 border-b border-border bg-background px-3 sm:px-5">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => { if (index < step) setStep(index); }}
            disabled={index > step}
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

      <div className="min-h-[430px] bg-card p-5 sm:p-7">
        {message ? <NoticeStrip claim="Campaign">{message}</NoticeStrip> : null}
        {step === 0 ? (
          <RecipientsStep
            data={leads}
            available={available}
            selected={selectedEmails}
            source={source}
            setSource={setSource}
            toggleEmail={toggleEmail}
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

      <div className="flex items-center justify-between border-t border-border bg-background px-5 py-4">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>
          <ChevronLeft className="size-4" aria-hidden="true" /> Back
        </Button>
        {step < 3 ? (
          <Button disabled={!canContinue} onClick={() => setStep((current) => Math.min(3, current + 1))} aria-label={`Continue to ${steps[step + 1]}`}>
            Continue <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button loading={saving} onClick={() => void save()} aria-label="Save campaign">
            <Mail className="size-4" aria-hidden="true" /> Save campaign
          </Button>
        )}
      </div>
    </SquircleSurface>
  );
}

function RecipientsStep({ data, available, selected, source, setSource, toggleEmail }: {
  data: LeadsResponse | null;
  available: LeadsResponse["leads"];
  selected: Set<string>;
  source: string;
  setSource: (source: string) => void;
  toggleEmail: (email: string) => void;
}) {
  const selectedCount = (data?.leads ?? []).filter((lead) => lead.status === "new" && selected.has(lead.email)).length;
  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="mt-1 text-sm text-muted-foreground">{selectedCount} available leads selected</p>
        </div>
        <label className="text-xs font-medium text-muted-foreground">
          Source
          <select value={source} onChange={(event) => setSource(event.target.value)} className="ml-2 h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground">
            <option value="">All sources</option>
            {data?.sources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
      </div>
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
        {data && available.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No new leads in this source.</p> : null}
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
  return (
    <div>
      <p className="mt-1 text-sm text-muted-foreground">Plain text stays readable and avoids invisible tracking.</p>
      <div className="mt-5 grid gap-4">
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
        <TextField label="Subject" value={subject} onChange={setSubject} placeholder="A short note for {company}" />
        <label className="text-xs font-medium text-muted-foreground">
          Message
          <textarea aria-label="Message" value={body} onChange={(event) => setBody(event.target.value)} rows={9} placeholder="Hi {firstName}," className="mt-1 w-full resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm leading-6 text-foreground" />
        </label>
        <p className="text-xs text-muted-foreground">Variables: <code className="font-mono">{"{firstName}"}</code> and <code className="font-mono">{"{company}"}</code>. Missing values use readable fallbacks.</p>
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
      <p className="mt-1 text-sm text-muted-foreground">Account safeguards still cap the campaign if these values are higher.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {accounts.map((account) => (
          <label key={account.id} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-background p-4 hover:bg-accent">
            <input type="checkbox" checked={selected.has(account.id)} onChange={() => toggleAccount(account)} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="block text-sm font-medium">{account.email}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{account.lastTestedAt ? "Test send confirmed" : "Test send required before start"} · {account.dailyCap}/day</span>
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
      <p className="mt-1 text-sm text-muted-foreground">Saving creates a paused campaign. Gmail sends nothing until you press Start.</p>
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

import { Database, Download, ExternalLink, KeyRound, Mail, Send, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleCard, SquircleCardRow } from "../components/squircle-card";
import type { AppApi, PublicAccount, SettingsResponse } from "./api";
import { PageFrame } from "./CampaignsPage";

export function SettingsPage({
  api,
  settings,
  error,
  onSettingsChange,
}: {
  api: AppApi;
  settings: SettingsResponse | null;
  error: boolean;
  onSettingsChange: (settings: SettingsResponse) => void;
}) {
  const [connectionAccount, setConnectionAccount] = useState<PublicAccount | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testingAccount, setTestingAccount] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const displayAccounts = useMemo(() => {
    const accounts = [...(settings?.accounts ?? [])];
    if (connectionAccount && !accounts.some((account) => account.id === connectionAccount.id)) {
      accounts.push(connectionAccount);
    }
    return accounts;
  }, [connectionAccount, settings?.accounts]);

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
  }, []);

  async function chooseClient(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setConnectionMessage(null);
    if (file.size > 256_000) {
      setConnectionMessage("That OAuth client file is unexpectedly large.");
      return;
    }

    const popup = window.open("about:blank", "tinymails-google", "popup,width=560,height=720");
    setConnecting(true);
    try {
      const client = JSON.parse(await readText(file)) as unknown;
      const started = await api.startGoogleOAuth(client);
      if (popup) popup.location.href = started.authorizationUrl;
      else setConnectionMessage("Your browser blocked the Google window. Allow popups and choose the file again.");
      await pollConnection(started.sessionId, popup);
    } catch (error) {
      popup?.close();
      setConnecting(false);
      setConnectionMessage(error instanceof Error ? error.message : "Gmail could not be connected.");
    }
  }

  async function pollConnection(sessionId: string, popup: Window | null): Promise<void> {
    const status = await api.getGoogleOAuthStatus(sessionId);
    if (status.status === "pending") {
      pollTimer.current = window.setTimeout(() => {
        void pollConnection(sessionId, popup).catch(() => {
          setConnecting(false);
          setConnectionMessage("TinyMails could not check the Google connection.");
        });
      }, 1_000);
      return;
    }
    setConnecting(false);
    if (status.status === "connected") {
      popup?.close();
      setConnectionAccount(status.account);
      setConnectionMessage(`${status.account.email} is connected.`);
      const refreshed = await api.getSettings();
      onSettingsChange(refreshed);
      return;
    }
    setConnectionMessage(status.message);
  }

  async function sendTest(account: PublicAccount) {
    setTestingAccount(account.id);
    setTestMessage(null);
    try {
      await api.sendTestEmail(account.id);
      setTestMessage(`Test email sent to ${account.email}.`);
    } catch (sendError) {
      setTestMessage(sendError instanceof Error ? sendError.message : "The test email could not be sent.");
    } finally {
      setTestingAccount(null);
    }
  }

  function accountRulesSaved(account: PublicAccount) {
    setEditingAccount(null);
    setConnectionAccount((current) => current?.id === account.id ? account : current);
    if (settings) {
      onSettingsChange({
        ...settings,
        accounts: settings.accounts.map((record) => record.id === account.id ? account : record),
      });
    }
    setConnectionMessage(`Sending rules saved for ${account.email}.`);
  }

  return (
    <PageFrame
      eyebrow="Local configuration"
      title="Settings"
      description="Gmail credentials and campaign data stay on this computer."
    >
      {error ? <NoticeStrip claim="Settings are unavailable.">Check that the local service is running.</NoticeStrip> : null}
      {connectionMessage ? (
        <NoticeStrip claim={connectionAccount ? "Connected" : "Gmail setup"}>{connectionMessage}</NoticeStrip>
      ) : null}
      {testMessage ? <NoticeStrip claim="Connection test">{testMessage}</NoticeStrip> : null}
      {displayAccounts.length === 0 ? (
        <NoticeStrip claim="No Gmail account connected">
          Add your own Google Desktop OAuth client below. Nothing can send until you finish Google consent.
        </NoticeStrip>
      ) : null}
      <SquircleCard title="Connect Gmail" icon={<KeyRound />} contentClassName="p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h3 className="text-base font-semibold tracking-[-0.02em]">Use your own Google OAuth client</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Create a Google Cloud project and configure its audience and test users.</li>
              <li>Enable the Gmail API for that project.</li>
              <li>Create an OAuth client with application type Desktop app.</li>
              <li>Download its JSON file, then choose it here.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              TinyMails requests your verified email and <code className="font-mono">gmail.send</code> only. Inbox
              reading is off.
            </p>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Open Google Cloud credentials <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </div>
          <label
            htmlFor="google-oauth-client"
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--primary)_90%,#3a3480)] px-3 text-sm font-medium text-primary-foreground shadow-[inset_0_1px_0_rgb(254_254_254_/_22%)] transition-all hover:bg-primary focus-within:ring-[3px] focus-within:ring-ring/50"
          >
            <Upload className="size-4" aria-hidden="true" />
            {connecting ? "Waiting for Google…" : "Choose OAuth client JSON"}
            <input
              id="google-oauth-client"
              aria-label="Google OAuth client JSON"
              type="file"
              accept="application/json,.json"
              className="sr-only"
              disabled={connecting}
              onChange={(event) => void chooseClient(event)}
            />
          </label>
        </div>
      </SquircleCard>
      <div className="grid gap-4 md:grid-cols-2">
        <SquircleCard title="Gmail accounts" icon={<Mail />} contentClassName="min-h-40 py-2">
          {settings === null ? <div className="h-32 animate-pulse" aria-label="Loading accounts" /> : null}
          {displayAccounts.map((account) => (
            <div key={account.id} className="border-b border-border last:border-b-0">
              <SquircleCardRow
                label={
                  <span className="flex flex-col">
                    <span>{account.label}</span>
                    <span className="text-xs text-muted-foreground">{account.email}</span>
                    <span className="text-xs text-muted-foreground">
                      {account.sendingWindow.start}–{account.sendingWindow.end} · {account.timeZone}
                    </span>
                  </span>
                }
                value={
                  <span className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setEditingAccount(editingAccount === account.id ? null : account.id)}
                      aria-label="Edit sending rules"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      loading={testingAccount === account.id}
                      onClick={() => void sendTest(account)}
                      aria-label="Send test email"
                    >
                      <Send className="size-3.5" aria-hidden="true" /> Test
                    </Button>
                  </span>
                }
                className="min-h-16"
              />
              {editingAccount === account.id ? (
                <AccountRulesForm
                  account={account}
                  api={api}
                  onCancel={() => setEditingAccount(null)}
                  onSaved={accountRulesSaved}
                />
              ) : null}
            </div>
          ))}
          {displayAccounts.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">No accounts yet.</p>
          ) : null}
        </SquircleCard>
        <SquircleCard title="Safety" icon={<ShieldCheck />} contentClassName="min-h-40 py-2">
          <SquircleCardRow label="Do-not-contact addresses" value={settings?.suppressionCount ?? 0} />
          <SquircleCardRow label="Tracking pixels" value="Off" />
          <SquircleCardRow label="Hosted data" value="None" />
        </SquircleCard>
      </div>
      <SquircleCard title="Local data" icon={<Database />} contentClassName="py-2">
        <SquircleCardRow
          label="Data directory"
          value={
            <code className="max-w-[52vw] truncate font-mono text-[11px] sm:max-w-lg">
              {settings?.dataDir ?? "Loading"}
            </code>
          }
          className="min-h-12"
        />
        <SquircleCardRow label="TinyMails version" value={settings?.version ?? "Loading"} />
        <SquircleCardRow
          label={
            <span className="flex flex-col py-2">
              <span>Portable backup</span>
              <span className="text-xs text-muted-foreground">Contacts and history; Google credentials excluded</span>
            </span>
          }
          value={
            <a href="/api/backup" download className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Download className="size-3.5" aria-hidden="true" /> Download
            </a>
          }
          className="min-h-14"
        />
      </SquircleCard>
    </PageFrame>
  );
}

const weekdays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

function AccountRulesForm({
  account,
  api,
  onCancel,
  onSaved,
}: {
  account: PublicAccount;
  api: AppApi;
  onCancel: () => void;
  onSaved: (account: PublicAccount) => void;
}) {
  const [dailyCap, setDailyCap] = useState(account.dailyCap);
  const [delayMinSeconds, setDelayMinSeconds] = useState(account.delayMinSeconds);
  const [delayMaxSeconds, setDelayMaxSeconds] = useState(account.delayMaxSeconds);
  const [timeZone, setTimeZone] = useState(account.timeZone);
  const [days, setDays] = useState(new Set(account.sendingWindow.days));
  const [start, setStart] = useState(account.sendingWindow.start);
  const [end, setEnd] = useState(account.sendingWindow.end);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateAccount(account.id, {
        dailyCap,
        delayMinSeconds,
        delayMaxSeconds,
        timeZone: timeZone.trim(),
        sendingWindow: { days: [...days], start, end },
      });
      onSaved(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The sending rules could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border bg-card px-4 py-4">
      {error ? <p role="status" className="mb-3 text-xs text-destructive">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <RuleNumber label="Account daily cap" value={dailyCap} min={1} max={500} onChange={setDailyCap} />
        <label className="text-xs font-medium text-muted-foreground">
          Time zone
          <input aria-label="Account time zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <RuleNumber label="Minimum delay" value={delayMinSeconds} min={0} max={3600} onChange={setDelayMinSeconds} />
        <RuleNumber label="Maximum delay" value={delayMaxSeconds} min={0} max={3600} onChange={setDelayMaxSeconds} />
        <label className="text-xs font-medium text-muted-foreground">
          Sending starts
          <input aria-label="Sending starts" type="time" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Sending ends
          <input aria-label="Sending ends" type="time" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
        </label>
      </div>
      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-muted-foreground">Sending days</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {weekdays.map((day) => (
            <label key={day.value} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={days.has(day.value)}
                onChange={() => setDays((current) => {
                  const next = new Set(current);
                  if (next.has(day.value)) next.delete(day.value);
                  else next.add(day.value);
                  return next;
                })}
                className="size-3.5 accent-primary"
              />
              {day.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" loading={saving} onClick={() => void save()} aria-label="Save sending rules">Save rules</Button>
      </div>
    </div>
  );
}

function RuleNumber({ label, value, min, max, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <input aria-label={label} type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" />
    </label>
  );
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")), { once: true });
    reader.addEventListener("error", () => reject(new Error("TinyMails could not read that OAuth client file.")), {
      once: true,
    });
    reader.readAsText(file);
  });
}

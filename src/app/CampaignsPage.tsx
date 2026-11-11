import { Ban, ChevronDown, ChevronUp, FilePenLine, MailPlus, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { cn } from "../components/cn";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleCard, SquircleSurface } from "../components/squircle-card";
import type { Campaign } from "../domain/types";
import type { AppApi } from "./api";
import { clearCampaignDraft, loadCampaignDraft, type CampaignDraft } from "./campaign-draft";
import { CampaignComposer } from "./CampaignComposer";

export function CampaignsPage({ api }: { api: AppApi }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [draft, setDraft] = useState<CampaignDraft | null>(() => loadCampaignDraft(window.localStorage));
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const running = campaigns?.filter((campaign) => campaign.status === "running") ?? [];
  // A campaign that is sending changes every few seconds; one that waits for tomorrow does not.
  const refreshMilliseconds = running.length === 0
    ? null
    : running.some((campaign) => !campaign.waitingReason) ? 2_000 : 15_000;

  useEffect(() => {
    let active = true;
    void api
      .getCampaigns()
      .then((records) => {
        if (active) setCampaigns(records);
      })
      .catch(() => {
        if (active) setError("Campaigns could not be loaded from the local service.");
      });
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    if (refreshMilliseconds === null) return;
    const interval = window.setInterval(() => {
      void api.getCampaigns().then(setCampaigns).catch(() => undefined);
    }, refreshMilliseconds);
    return () => window.clearInterval(interval);
  }, [api, refreshMilliseconds]);

  async function changeStatus(campaign: Campaign, action: "start" | "pause") {
    setActionId(campaign.id);
    setError(null);
    try {
      const updated = action === "start"
        ? await api.startCampaign(campaign.id)
        : await api.pauseCampaign(campaign.id);
      setCampaigns((current) => (current ?? []).map((record) => record.id === updated.id ? updated : record));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The campaign status could not be changed.");
    } finally {
      setActionId(null);
    }
  }

  async function stopCampaign(campaign: Campaign) {
    setActionId(campaign.id);
    setError(null);
    try {
      const updated = await api.stopCampaign(campaign.id);
      setCampaigns((current) => (current ?? []).map((record) => record.id === updated.id ? updated : record));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The campaign could not be stopped.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <PageFrame
      title="Campaigns"
      description="Review every recipient, limit, and account before Gmail sends anything."
      fillViewport={composing}
      action={
        !composing && !draft && campaigns && campaigns.length > 0 ? (
          <Button onClick={() => setComposing(true)}>
            <Plus className="size-4" aria-hidden="true" /> New campaign
          </Button>
        ) : undefined
      }
    >
      {error ? <NoticeStrip claim="Campaigns are unavailable.">{error}</NoticeStrip> : null}
      {composing ? (
        <CampaignComposer
          api={api}
          initialDraft={draft}
          onCancel={() => setComposing(false)}
          onDraftChange={setDraft}
          onSaved={(campaign) => setCampaigns((current) => upsertCampaign(current, campaign))}
          onCreated={(campaign) => {
            setCampaigns((current) => upsertCampaign(current, campaign));
            setDraft(null);
            setComposing(false);
          }}
        />
      ) : null}
      {!composing && campaigns === null ? <CampaignSkeleton /> : null}
      {!composing && draft ? (
        <DraftRow
          draft={draft}
          onResume={() => setComposing(true)}
          onDiscard={() => {
            clearCampaignDraft(window.localStorage);
            setDraft(null);
          }}
        />
      ) : null}
      {!composing && campaigns?.length === 0 && !draft ? (
        <SquircleSurface
          role="region"
          aria-label="Empty campaigns"
          className="items-center border border-border px-6 py-16 text-center shadow-[var(--shadow-resting)]"
        >
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <MailPlus className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Your outbox is clear</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Connect Gmail, import a permission-based list, then review the recipients and delivery rules here.
          </p>
          <Button className="mt-6" onClick={() => setComposing(true)}>
            <Plus className="size-4" aria-hidden="true" /> New campaign
          </Button>
        </SquircleSurface>
      ) : null}
      {!composing && campaigns && campaigns.length > 0 ? (
        <SquircleCard title="Active and recent" icon={<Send />} contentClassName="divide-y divide-border">
          {campaigns.map((campaign) => {
            const sent = campaign.recipients.filter((recipient) => recipient.status === "sent").length;
            const failed = campaign.recipients.filter((recipient) => recipient.status === "failed").length;
            const expanded = expandedId === campaign.id;
            const waiting = campaign.status === "running" && Boolean(campaign.waitingReason);
            return (
              <div key={campaign.id}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                    onClick={() => setExpandedId(expanded ? null : campaign.id)}
                    aria-label={`View ${campaign.name}`}
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronUp className="size-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{campaign.name}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground first-letter:uppercase">
                        {waiting ? "waiting" : campaign.status} · {sent}/{campaign.recipients.length} sent{failed ? ` · ${failed} failed` : ""}
                      </span>
                      {campaign.status === "paused" && campaign.pauseReason ? (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {campaign.pauseReason}
                        </span>
                      ) : null}
                      {waiting ? (
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {waitingLine(campaign)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs tabular-nums text-muted-foreground">{campaign.dailyCap}/day</span>
                    {campaign.status === "running" ? (
                      <Button variant="secondary" size="xs" loading={actionId === campaign.id} onClick={() => void changeStatus(campaign, "pause")} aria-label={`Pause ${campaign.name}`}>
                        <Pause className="size-3.5" aria-hidden="true" /> Pause
                      </Button>
                    ) : campaign.status === "paused" && campaign.recipients.some((recipient) => recipient.status === "pending") ? (
                      <Button size="xs" loading={actionId === campaign.id} onClick={() => void changeStatus(campaign, "start")} aria-label={`Start ${campaign.name}`}>
                        <Play className="size-3.5" aria-hidden="true" /> Start
                      </Button>
                    ) : null}
                  </div>
                </div>
                {expanded ? (
                  <CampaignDetail
                    campaign={campaign}
                    stopping={actionId === campaign.id}
                    onStop={() => void stopCampaign(campaign)}
                  />
                ) : null}
              </div>
            );
          })}
        </SquircleCard>
      ) : null}
    </PageFrame>
  );
}

/** When an email left, in the reader's own time zone and format. */
function sentTime(sentAt: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(sentAt));
}

/** Why a running campaign is idle, and when it carries on by itself. */
function waitingLine(campaign: Campaign): string {
  if (!campaign.resumesAt) return campaign.waitingReason ?? "";
  const resumes = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(campaign.resumesAt));
  return `${campaign.waitingReason} It continues on its own, ${resumes}.`;
}

function upsertCampaign(current: Campaign[] | null, campaign: Campaign): Campaign[] {
  const records = current ?? [];
  return records.some((record) => record.id === campaign.id)
    ? records.map((record) => (record.id === campaign.id ? campaign : record))
    : [campaign, ...records];
}

function DraftRow({ draft, onResume, onDiscard }: {
  draft: CampaignDraft;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const name = draft.name.trim() || "Untitled campaign";
  const step = ["Recipients", "Write", "Delivery", "Review"][draft.step];
  return (
    <SquircleSurface className="border border-border px-4 py-3 shadow-[var(--shadow-resting)] sm:flex-row sm:items-center sm:gap-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground">
        <FilePenLine className="size-4" aria-hidden="true" />
      </span>
      <span className="mt-3 min-w-0 flex-1 sm:mt-0">
        <span className="block text-xs font-medium text-muted-foreground">Draft</span>
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block text-xs text-muted-foreground">Step {draft.step + 1} of 4 · {step}</span>
      </span>
      <span className="mt-3 flex items-center gap-2 sm:mt-0">
        <Button size="sm" onClick={onResume} aria-label={`Resume ${name}`}>Resume</Button>
        <Button variant="ghost" size="sm" onClick={onDiscard} aria-label={`Discard ${name}`}>
          <Trash2 className="size-4" aria-hidden="true" /> Discard
        </Button>
      </span>
    </SquircleSurface>
  );
}

function CampaignDetail({ campaign, stopping, onStop }: {
  campaign: Campaign;
  stopping: boolean;
  onStop: () => void;
}) {
  return (
    <div className="border-t border-border bg-card px-4 pb-4 pt-3">
      <div className="grid gap-3 rounded-xl border border-border bg-background p-4 text-xs sm:grid-cols-3">
        <div><span className="block text-muted-foreground">Subject</span><span className="mt-1 block font-medium">{campaign.subject}</span></div>
        <div><span className="block text-muted-foreground">Gmail accounts</span><span className="mt-1 block font-medium">{campaign.accountIds.length}</span></div>
        <div><span className="block text-muted-foreground">Delay</span><span className="mt-1 block font-medium">{campaign.delayMinSeconds}–{campaign.delayMaxSeconds} seconds</span></div>
      </div>
      <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[560px] border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-background text-muted-foreground"><tr><th className="px-3 py-2">Recipient</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th></tr></thead>
          <tbody>
            {campaign.recipients.map((recipient) => (
              <tr key={recipient.email} className="border-t border-border">
                <td className="px-3 py-2.5">{recipient.email}</td>
                <td className="px-3 py-2.5 capitalize">{recipient.status}</td>
                <td className="max-w-72 truncate px-3 py-2.5 text-muted-foreground">{recipient.error ?? (recipient.sentAt ? sentTime(recipient.sentAt) : "Waiting")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {campaign.status === "paused" && campaign.recipients.some((recipient) => recipient.status === "pending") ? (
        <div className="mt-3 flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">Stopping ends this campaign and marks waiting recipients as not sent.</span>
          <Button variant="ghost" size="xs" loading={stopping} onClick={onStop} aria-label={`Stop ${campaign.name}`}>
            <Ban className="size-3.5" aria-hidden="true" /> Stop campaign
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PageFrame({
  eyebrow,
  title,
  description,
  action,
  fillViewport = false,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
  fillViewport?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "oa-arrive mx-auto w-full max-w-5xl px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8",
        fillViewport ? "flex h-[calc(100dvh-5.25rem)] flex-col overflow-hidden pb-4" : "pb-16",
      )}
    >
      <header
        className={cn(
          "shrink-0",
          action ? "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" : undefined,
          fillViewport ? "mb-4 sm:mb-6" : "mb-8",
        )}
      >
        <div className="min-w-0">
          {eyebrow ? <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
          <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="shrink-0 self-start sm:self-auto">{action}</div> : null}
      </header>
      <div className={cn("flex min-h-0 flex-col gap-4", fillViewport && "flex-1")}>{children}</div>
    </section>
  );
}

function CampaignSkeleton() {
  return (
    <div aria-label="Loading campaigns" className="h-48 animate-pulse rounded-[26px] border border-border bg-card" />
  );
}

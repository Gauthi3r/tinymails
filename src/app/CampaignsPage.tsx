import { ChevronDown, ChevronUp, MailPlus, Pause, Play, Plus, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "../components/button";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleCard, SquircleSurface } from "../components/squircle-card";
import type { Campaign } from "../domain/types";
import type { AppApi } from "./api";
import { CampaignComposer } from "./CampaignComposer";

export function CampaignsPage({ api }: { api: AppApi }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

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
    if (!campaigns?.some((campaign) => campaign.status === "running")) return;
    const interval = window.setInterval(() => {
      void api.getCampaigns().then(setCampaigns).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [api, campaigns]);

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

  async function testCampaign(campaign: Campaign) {
    setActionId(campaign.id);
    setError(null);
    try {
      const updated = await api.testCampaign(campaign.id);
      setCampaigns((current) => (current ?? []).map((record) => record.id === updated.id ? updated : record));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "The campaign preview could not be sent.");
    } finally {
      setActionId(null);
    }
  }

  return (
    <PageFrame
      eyebrow="Outbox"
      title="Campaigns"
      description="Review every recipient, limit, and account before Gmail sends anything."
    >
      {composing ? (
        <CampaignComposer
          api={api}
          onCancel={() => setComposing(false)}
          onCreated={(campaign) => {
            setCampaigns((current) => [campaign, ...(current ?? [])]);
            setComposing(false);
          }}
        />
      ) : (
        <div className="flex justify-end">
          <Button onClick={() => setComposing(true)}><Plus className="size-4" aria-hidden="true" /> New campaign</Button>
        </div>
      )}
      {error ? <NoticeStrip claim="Campaigns are unavailable.">{error}</NoticeStrip> : null}
      {!composing && campaigns === null ? <CampaignSkeleton /> : null}
      {!composing && campaigns?.length === 0 ? (
        <SquircleSurface className="items-center border border-border px-6 py-16 text-center shadow-[var(--shadow-resting)]">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <MailPlus className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Your outbox is clear</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Connect Gmail, import a permission-based list, then review the recipients and delivery rules here.
          </p>
        </SquircleSurface>
      ) : null}
      {!composing && campaigns && campaigns.length > 0 ? (
        <SquircleCard title="Active and recent" icon={<Send />} contentClassName="divide-y divide-border">
          {campaigns.map((campaign) => {
            const sent = campaign.recipients.filter((recipient) => recipient.status === "sent").length;
            const failed = campaign.recipients.filter((recipient) => recipient.status === "failed").length;
            const expanded = expandedId === campaign.id;
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
                      <span className="mt-0.5 block text-xs capitalize text-muted-foreground">
                        {campaign.status} · {sent}/{campaign.recipients.length} sent{failed ? ` · ${failed} failed` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <span className="text-xs tabular-nums text-muted-foreground">{campaign.dailyCap}/day</span>
                    {campaign.status === "running" ? (
                      <Button variant="secondary" size="xs" loading={actionId === campaign.id} onClick={() => void changeStatus(campaign, "pause")} aria-label={`Pause ${campaign.name}`}>
                        <Pause className="size-3.5" aria-hidden="true" /> Pause
                      </Button>
                    ) : campaign.status === "paused" && campaign.recipients.some((recipient) => recipient.status === "pending") ? (
                      campaign.testedAt ? (
                        <Button size="xs" loading={actionId === campaign.id} onClick={() => void changeStatus(campaign, "start")} aria-label={`Start ${campaign.name}`}>
                          <Play className="size-3.5" aria-hidden="true" /> Start
                        </Button>
                      ) : (
                        <Button variant="secondary" size="xs" loading={actionId === campaign.id} onClick={() => void testCampaign(campaign)} aria-label={`Test ${campaign.name}`}>
                          <Send className="size-3.5" aria-hidden="true" /> Send test
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>
                {expanded ? <CampaignDetail campaign={campaign} /> : null}
              </div>
            );
          })}
        </SquircleCard>
      ) : null}
    </PageFrame>
  );
}

function CampaignDetail({ campaign }: { campaign: Campaign }) {
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
                <td className="max-w-72 truncate px-3 py-2.5 text-muted-foreground">{recipient.error ?? recipient.sentAt ?? "Waiting"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PageFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="oa-arrive mx-auto w-full max-w-5xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:px-8">
      <header className="mb-8">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-foreground">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function CampaignSkeleton() {
  return (
    <div aria-label="Loading campaigns" className="h-48 animate-pulse rounded-[26px] border border-border bg-card" />
  );
}

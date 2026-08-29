import { MailPlus, Send } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleCard, SquircleCardRow, SquircleSurface } from "../components/squircle-card";
import type { Campaign } from "../domain/types";
import type { AppApi } from "./api";

export function CampaignsPage({ api }: { api: AppApi }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <PageFrame
      eyebrow="Outbox"
      title="Campaigns"
      description="Review every recipient, limit, and account before Gmail sends anything."
    >
      {error ? <NoticeStrip claim="Campaigns are unavailable.">{error}</NoticeStrip> : null}
      {campaigns === null ? <CampaignSkeleton /> : null}
      {campaigns?.length === 0 ? (
        <SquircleSurface className="items-center border border-border px-6 py-16 text-center shadow-[var(--shadow-resting)]">
          <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-secondary text-muted-foreground">
            <MailPlus className="size-5" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">Your outbox is clear</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Connect Gmail in Settings and import a permission-based list. Campaign creation lands in the next milestone.
          </p>
        </SquircleSurface>
      ) : null}
      {campaigns && campaigns.length > 0 ? (
        <SquircleCard title="Active and recent" icon={<Send />} contentClassName="py-2">
          {campaigns.map((campaign) => {
            const sent = campaign.recipients.filter((recipient) => recipient.status === "sent").length;
            return (
              <SquircleCardRow
                key={campaign.id}
                className="min-h-14"
                label={
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{campaign.name}</span>
                    <span className="text-xs capitalize text-muted-foreground">{campaign.status}</span>
                  </span>
                }
                value={`${sent} / ${campaign.recipients.length}`}
              />
            );
          })}
        </SquircleCard>
      ) : null}
    </PageFrame>
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

import { Database, Mail, ShieldCheck } from "lucide-react";
import { NoticeStrip } from "../components/notice-strip";
import { SquircleCard, SquircleCardRow } from "../components/squircle-card";
import type { SettingsResponse } from "./api";
import { PageFrame } from "./CampaignsPage";

export function SettingsPage({ settings, error }: { settings: SettingsResponse | null; error: boolean }) {
  return (
    <PageFrame
      eyebrow="Local configuration"
      title="Settings"
      description="Gmail credentials and campaign data stay on this computer."
    >
      {error ? <NoticeStrip claim="Settings are unavailable.">Check that the local service is running.</NoticeStrip> : null}
      {settings?.accounts.length === 0 ? (
        <NoticeStrip claim="No Gmail account connected">
          Bring-your-own Google OAuth setup lands in the next milestone. Nothing can send until an account is connected.
        </NoticeStrip>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <SquircleCard title="Gmail accounts" icon={<Mail />} contentClassName="min-h-40 py-2">
          {settings === null ? <div className="h-32 animate-pulse" aria-label="Loading accounts" /> : null}
          {settings?.accounts.map((account) => (
            <SquircleCardRow
              key={account.id}
              label={
                <span className="flex flex-col">
                  <span>{account.label}</span>
                  <span className="text-xs text-muted-foreground">{account.email}</span>
                </span>
              }
              value={`${account.dailyCap}/day`}
              className="min-h-14"
            />
          ))}
          {settings?.accounts.length === 0 ? (
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
      </SquircleCard>
    </PageFrame>
  );
}

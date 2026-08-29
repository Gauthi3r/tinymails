import { Inbox, ListFilter, Mail, Settings as SettingsIcon, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/button";
import { TabBar, type Tab } from "../components/tab-bar";
import type { AppApi, SettingsResponse } from "./api";
import { CampaignsPage } from "./CampaignsPage";
import { LeadsPage } from "./LeadsPage";
import { RepliesPage } from "./RepliesPage";
import { SettingsPage } from "./SettingsPage";

type Page = "campaigns" | "leads" | "replies" | "settings";

const tabs: readonly Tab[] = [
  { id: "campaigns", label: "Campaigns", icon: <ListFilter /> },
  { id: "leads", label: "Leads", icon: <UsersRound /> },
  { id: "replies", label: "Replies", icon: <Inbox /> },
];

export function App({ api }: { api: AppApi }) {
  const [page, setPage] = useState<Page>("campaigns");
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [settingsError, setSettingsError] = useState(false);

  useEffect(() => {
    let active = true;
    void api
      .getSettings()
      .then((response) => {
        if (active) setSettings(response);
      })
      .catch(() => {
        if (active) setSettingsError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const primaryPage = page === "settings" ? "campaigns" : page;

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-border bg-card">
        <div className="mx-auto grid h-full max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setPage("campaigns")}
            className="flex w-fit items-center gap-2 rounded-lg text-sm font-semibold tracking-[-0.02em] text-foreground"
            aria-label="TinyMails home"
          >
            <span className="grid size-7 place-items-center rounded-[9px] bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(254_254_254_/_22%)]">
              <Mail className="size-3.5" aria-hidden="true" />
            </span>
            <span className="hidden sm:inline">TinyMails</span>
          </button>

          <TabBar tabs={tabs} activeId={primaryPage} onChange={(id) => setPage(id as Page)} />

          <div className="flex items-center justify-end gap-2">
            <span className="hidden max-w-44 truncate text-xs text-muted-foreground lg:block">
              {settings?.accounts[0]?.email ?? "Local only"}
            </span>
            <Button
              variant={page === "settings" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPage("settings")}
              aria-label="Settings"
              className="px-2 sm:px-3"
            >
              <SettingsIcon className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="pt-14">
        {page === "campaigns" ? <CampaignsPage api={api} /> : null}
        {page === "leads" ? <LeadsPage api={api} /> : null}
        {page === "replies" ? <RepliesPage api={api} /> : null}
        {page === "settings" ? (
          <SettingsPage
            api={api}
            settings={settings}
            error={settingsError}
            onSettingsChange={setSettings}
          />
        ) : null}
      </main>
    </div>
  );
}

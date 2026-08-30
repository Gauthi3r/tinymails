import { ListFilter, Settings as SettingsIcon, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import tinymailsLogo from "../assets/tinymails-logo.png";
import { TabBar, type Tab } from "../components/tab-bar";
import type { AppApi, SettingsResponse } from "./api";
import { CampaignsPage } from "./CampaignsPage";
import { LeadsPage } from "./LeadsPage";
import { SettingsPage } from "./SettingsPage";

type Page = "campaigns" | "leads" | "settings";

const tabs: readonly Tab[] = [
  { id: "campaigns", label: "Campaigns", icon: <ListFilter /> },
  { id: "leads", label: "Leads", icon: <UsersRound /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
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

  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-3 z-30 flex justify-center px-4">
        <TabBar
          tabs={tabs}
          activeId={page}
          onChange={(id) => setPage(id as Page)}
          brand={{
            label: "TinyMails home",
            imageSrc: tinymailsLogo,
            imageAlt: "TinyMails",
            onClick: () => setPage("campaigns"),
          }}
          className="pointer-events-auto"
        />
      </div>

      <main className="pt-14">
        {page === "campaigns" ? <CampaignsPage api={api} /> : null}
        {page === "leads" ? <LeadsPage api={api} /> : null}
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

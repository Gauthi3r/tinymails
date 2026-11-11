import { Bot, Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../components/cn";
import { SquircleCard } from "../components/squircle-card";
import type { AppApi, SettingsResponse } from "./api";

/**
 * How an agent reaches TinyMails over MCP, and the one decision the user
 * keeps: whether an agent may press Start.
 */
export function AgentsCard({
  api,
  settings,
  onSettingsChange,
}: {
  api: AppApi;
  settings: SettingsResponse | null;
  onSettingsChange: (settings: SettingsResponse) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const address = `${window.location.origin}/mcp`;
  const command = settings?.mcpBridgePath ? `node "${settings.mcpBridgePath}"` : null;
  const canStart = settings?.agentsCanStart ?? false;

  async function toggleStart() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      onSettingsChange({ ...settings, agentsCanStart: await api.setAgentsCanStart(!canStart) });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "That setting could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SquircleCard title="Agents" icon={<Bot />} contentClassName="divide-y divide-border">
      <AgentRow
        title="MCP address"
        detail="Add it to an agent on this computer. It can queue a campaign, send you the test, check progress and pause."
      >
        <CopyValue label="MCP address" value={address} />
      </AgentRow>
      {command ? (
        <AgentRow title="MCP command" detail="For an agent that starts a command instead of opening an address.">
          <CopyValue label="MCP command" value={command} />
        </AgentRow>
      ) : null}
      <AgentRow
        title="Let agents start campaigns"
        detail={error ?? (canStart
          ? "On. An agent can start a campaign once its test has been sent."
          : "Off. Agents queue and test. You press Start.")}
      >
        <button
          type="button"
          role="switch"
          aria-checked={canStart}
          aria-label="Let agents start campaigns"
          disabled={!settings || saving}
          onClick={() => void toggleStart()}
          className={cn(
            "relative h-6 w-10 shrink-0 cursor-pointer rounded-full border border-border outline-none transition-colors",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50",
            canStart ? "bg-primary" : "bg-secondary",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0.5 top-0.5 size-[18px] rounded-full bg-background shadow-[var(--shadow-resting)] transition-transform",
              canStart && "translate-x-4",
            )}
          />
        </button>
      </AgentRow>
    </SquircleCard>
  );
}

function AgentRow({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="min-w-0 sm:max-w-sm">
        <span className="block text-sm">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
      {children}
    </div>
  );
}

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Without clipboard access the value stays selectable on screen.
    }
  }

  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="min-w-0 truncate rounded-lg bg-secondary px-2 py-1 font-mono text-[11px] sm:max-w-xs">{value}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}

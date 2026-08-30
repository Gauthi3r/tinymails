export const CAMPAIGN_DRAFT_KEY = "tinymails.campaign-draft.v1";

export interface CampaignDraft {
  version: 2;
  step: 0 | 1 | 2 | 3;
  selectedEmails: string[];
  selectedAccounts: string[];
  listId: string;
  name: string;
  subject: string;
  body: string;
  dailyCap: number;
  delayMin: number;
  delayMax: number;
  updatedAt: string;
}

export function loadCampaignDraft(storage: Storage): CampaignDraft | null {
  try {
    const stored = storage.getItem(CAMPAIGN_DRAFT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as unknown;
    if (isCampaignDraft(parsed)) return parsed;
    if (isLegacyCampaignDraft(parsed)) {
      const { source: _source, ...draft } = parsed;
      return { ...draft, version: 2, listId: "" };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCampaignDraft(storage: Storage, draft: CampaignDraft): void {
  try {
    storage.setItem(CAMPAIGN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort when browser storage is unavailable.
  }
}

export function clearCampaignDraft(storage: Storage): void {
  try {
    storage.removeItem(CAMPAIGN_DRAFT_KEY);
  } catch {
    // The in-memory composer still works when browser storage is unavailable.
  }
}

function isCampaignDraft(value: unknown): value is CampaignDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === 2 &&
    Number.isInteger(draft.step) &&
    Number(draft.step) >= 0 &&
    Number(draft.step) <= 3 &&
    isStringArray(draft.selectedEmails) &&
    isStringArray(draft.selectedAccounts) &&
    typeof draft.listId === "string" &&
    typeof draft.name === "string" &&
    typeof draft.subject === "string" &&
    typeof draft.body === "string" &&
    isFiniteNumber(draft.dailyCap) &&
    isFiniteNumber(draft.delayMin) &&
    isFiniteNumber(draft.delayMax) &&
    typeof draft.updatedAt === "string"
  );
}

function isLegacyCampaignDraft(value: unknown): value is Omit<CampaignDraft, "version" | "listId"> & {
  version: 1;
  source: string;
} {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return (
    draft.version === 1
    && Number.isInteger(draft.step)
    && Number(draft.step) >= 0
    && Number(draft.step) <= 3
    && isStringArray(draft.selectedEmails)
    && isStringArray(draft.selectedAccounts)
    && typeof draft.source === "string"
    && typeof draft.name === "string"
    && typeof draft.subject === "string"
    && typeof draft.body === "string"
    && isFiniteNumber(draft.dailyCap)
    && isFiniteNumber(draft.delayMin)
    && isFiniteNumber(draft.delayMax)
    && typeof draft.updatedAt === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

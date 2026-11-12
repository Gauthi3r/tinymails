// The one place this site touches TinyMails' own source. Everything the demo
// shows comes from these functions, unmodified.
export { CAP_WAIT_REASON, CampaignRunner, WINDOW_WAIT_REASON } from "@product/server/campaign-runner";
export type {
  AccountRepository,
  CampaignRepository,
  SuppressionRepository,
} from "@product/server/campaign-runner";
export { createCampaign, renderMessage, withoutWait } from "@product/domain/campaigns";
export type { CreateCampaignResult } from "@product/domain/campaigns";
export { mergeLeads } from "@product/domain/leads";
export type { MergeLeadsResult } from "@product/domain/leads";
export { FakeGmailAccountAdapter } from "@product/gmail/fake-adapter";
export type { Account, Campaign, ContactInput, Lead, SendingWindow } from "@product/domain/types";

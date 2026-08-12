export const offlineCampaignChannels = [
  "RADIO",
  "PRINT",
  "EVENT",
  "DIRECT_MAIL",
  "QR",
  "OUTDOOR",
  "TV",
  "PARTNERSHIP",
  "REFERRAL",
  "OTHER",
] as const;

export const offlineCampaignStatuses = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ARCHIVED",
] as const;

export type OfflineCampaignChannelValue = (typeof offlineCampaignChannels)[number];
export type OfflineCampaignStatusValue = (typeof offlineCampaignStatuses)[number];

export const offlineCampaignChannelLabels: Record<OfflineCampaignChannelValue, string> = {
  RADIO: "Radio",
  PRINT: "Print",
  EVENT: "Event",
  DIRECT_MAIL: "Direct mail",
  QR: "QR",
  OUTDOOR: "Outdoor",
  TV: "TV",
  PARTNERSHIP: "Partnership",
  REFERRAL: "Referral",
  OTHER: "Other",
};

export const offlineCampaignStatusLabels: Record<OfflineCampaignStatusValue, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PAUSED: "Paused",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

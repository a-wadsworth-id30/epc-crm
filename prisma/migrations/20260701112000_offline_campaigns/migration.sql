CREATE TYPE "OfflineCampaignChannel" AS ENUM (
  'RADIO',
  'PRINT',
  'EVENT',
  'DIRECT_MAIL',
  'QR',
  'OUTDOOR',
  'TV',
  'PARTNERSHIP',
  'REFERRAL',
  'OTHER'
);

CREATE TYPE "OfflineCampaignStatus" AS ENUM (
  'DRAFT',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'ARCHIVED'
);

CREATE TABLE "OfflineCampaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "channel" "OfflineCampaignChannel" NOT NULL,
  "status" "OfflineCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "source" TEXT NOT NULL,
  "medium" TEXT NOT NULL DEFAULT 'offline',
  "campaign" TEXT NOT NULL,
  "content" TEXT,
  "term" TEXT,
  "destinationUrl" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "budgetCents" INTEGER,
  "actualCostCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "notes" TEXT,
  "metadata" JSONB,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OfflineCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AttributionPhoneNumber"
  ADD COLUMN "offlineCampaignId" TEXT;

ALTER TABLE "AttributionRecord"
  ADD COLUMN "offlineCampaignId" TEXT;

ALTER TABLE "AttributionTouchpoint"
  ADD COLUMN "offlineCampaignId" TEXT;

CREATE UNIQUE INDEX "OfflineCampaign_code_key" ON "OfflineCampaign"("code");
CREATE INDEX "OfflineCampaign_channel_status_idx" ON "OfflineCampaign"("channel", "status");
CREATE INDEX "OfflineCampaign_source_campaign_idx" ON "OfflineCampaign"("source", "campaign");
CREATE INDEX "OfflineCampaign_startDate_endDate_idx" ON "OfflineCampaign"("startDate", "endDate");
CREATE INDEX "OfflineCampaign_createdByUserId_idx" ON "OfflineCampaign"("createdByUserId");

CREATE INDEX "AttributionPhoneNumber_offlineCampaignId_idx" ON "AttributionPhoneNumber"("offlineCampaignId");
CREATE INDEX "AttributionRecord_offlineCampaignId_idx" ON "AttributionRecord"("offlineCampaignId");
CREATE INDEX "AttributionTouchpoint_offlineCampaignId_capturedAt_idx" ON "AttributionTouchpoint"("offlineCampaignId", "capturedAt");

ALTER TABLE "OfflineCampaign"
  ADD CONSTRAINT "OfflineCampaign_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttributionPhoneNumber"
  ADD CONSTRAINT "AttributionPhoneNumber_offlineCampaignId_fkey"
  FOREIGN KEY ("offlineCampaignId") REFERENCES "OfflineCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttributionRecord"
  ADD CONSTRAINT "AttributionRecord_offlineCampaignId_fkey"
  FOREIGN KEY ("offlineCampaignId") REFERENCES "OfflineCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AttributionTouchpoint"
  ADD CONSTRAINT "AttributionTouchpoint_offlineCampaignId_fkey"
  FOREIGN KEY ("offlineCampaignId") REFERENCES "OfflineCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "MarketingIntegrationSyncStatus" AS ENUM ('SUCCESS', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "MarketingIntegrationSyncLog" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "MarketingIntegrationSyncStatus" NOT NULL,
    "syncType" TEXT NOT NULL,
    "recordsRead" INTEGER NOT NULL DEFAULT 0,
    "recordsWritten" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingIntegrationSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaignSpend" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaignSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingIntegrationSyncLog_provider_startedAt_idx" ON "MarketingIntegrationSyncLog"("provider", "startedAt");

-- CreateIndex
CREATE INDEX "MarketingIntegrationSyncLog_integrationId_startedAt_idx" ON "MarketingIntegrationSyncLog"("integrationId", "startedAt");

-- CreateIndex
CREATE INDEX "MarketingCampaignSpend_provider_date_idx" ON "MarketingCampaignSpend"("provider", "date");

-- CreateIndex
CREATE INDEX "MarketingCampaignSpend_campaignId_date_idx" ON "MarketingCampaignSpend"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaignSpend_provider_accountId_campaignId_date_key" ON "MarketingCampaignSpend"("provider", "accountId", "campaignId", "date");

-- AddForeignKey
ALTER TABLE "MarketingIntegrationSyncLog" ADD CONSTRAINT "MarketingIntegrationSyncLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

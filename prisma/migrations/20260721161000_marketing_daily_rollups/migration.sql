CREATE TABLE "MarketingDailyRollup" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'ALL',
  "provider" TEXT NOT NULL DEFAULT 'ALL',
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "sessions" INTEGER NOT NULL DEFAULT 0,
  "attributionRecords" INTEGER NOT NULL DEFAULT 0,
  "formLeads" INTEGER NOT NULL DEFAULT 0,
  "phoneLeads" INTEGER NOT NULL DEFAULT 0,
  "otherLeads" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "conversions" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costMicros" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingDailyRollup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingDailyRollup_date_source_provider_key"
  ON "MarketingDailyRollup"("date", "source", "provider");
CREATE INDEX "MarketingDailyRollup_date_idx"
  ON "MarketingDailyRollup"("date");
CREATE INDEX "MarketingDailyRollup_source_date_idx"
  ON "MarketingDailyRollup"("source", "date");
CREATE INDEX "MarketingDailyRollup_provider_date_idx"
  ON "MarketingDailyRollup"("provider", "date");

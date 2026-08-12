-- Add retry/audit metadata to provider conversion upload rows.
ALTER TABLE "MarketingConversionUpload"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

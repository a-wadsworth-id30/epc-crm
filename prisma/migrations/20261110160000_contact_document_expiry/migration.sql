ALTER TABLE "FileAsset"
ADD COLUMN "documentExpiresAt" TIMESTAMP(3),
ADD COLUMN "documentExpiryReminderAt" TIMESTAMP(3),
ADD COLUMN "documentExpiryReminderDays" INTEGER;

CREATE INDEX "FileAsset_entityType_documentExpiryReminderAt_idx"
ON "FileAsset"("entityType", "documentExpiryReminderAt");

CREATE INDEX "FileAsset_documentExpiresAt_idx"
ON "FileAsset"("documentExpiresAt");

-- Add configurable CRM document-library folders and per-file folder assignment.
ALTER TABLE "CrmSettings"
ADD COLUMN "documentLibrary" JSONB;

ALTER TABLE "FileAsset"
ADD COLUMN "documentFolder" TEXT;

CREATE INDEX "FileAsset_entityType_entityId_documentFolder_idx"
ON "FileAsset"("entityType", "entityId", "documentFolder");

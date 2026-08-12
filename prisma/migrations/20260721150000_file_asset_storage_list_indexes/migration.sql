DROP INDEX IF EXISTS "FileAsset_uploadedById_idx";

CREATE INDEX "FileAsset_originalName_createdAt_idx"
  ON "FileAsset"("originalName", "createdAt");
CREATE INDEX "FileAsset_mimeType_createdAt_idx"
  ON "FileAsset"("mimeType", "createdAt");
CREATE INDEX "FileAsset_sizeBytes_createdAt_idx"
  ON "FileAsset"("sizeBytes", "createdAt");
CREATE INDEX "FileAsset_uploadedById_createdAt_idx"
  ON "FileAsset"("uploadedById", "createdAt");

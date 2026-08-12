-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "documentUploadType" TEXT;

-- CreateIndex
CREATE INDEX "FileAsset_documentUploadType_createdAt_idx" ON "FileAsset"("documentUploadType", "createdAt");

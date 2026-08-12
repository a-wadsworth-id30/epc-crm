CREATE TYPE "FileAssetVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

CREATE TABLE "FileAsset" (
  "id" TEXT NOT NULL,
  "storageProvider" TEXT NOT NULL DEFAULT 'cloudflare-r2',
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "visibility" "FileAssetVisibility" NOT NULL DEFAULT 'PRIVATE',
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileAsset_key_key" ON "FileAsset"("key");
CREATE INDEX "FileAsset_entityType_entityId_idx" ON "FileAsset"("entityType", "entityId");
CREATE INDEX "FileAsset_uploadedById_idx" ON "FileAsset"("uploadedById");

ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "CustomerDocumentShareStatus" AS ENUM ('OPEN', 'REVOKED');

-- CreateTable
CREATE TABLE "CustomerDocumentShare" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "CustomerDocumentShareStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerDocumentShareFile" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "displayName" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "firstDownloadedAt" TIMESTAMP(3),
    "lastDownloadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerDocumentShareFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocumentShare_tokenHash_key" ON "CustomerDocumentShare"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerDocumentShare_entityType_entityId_createdAt_idx" ON "CustomerDocumentShare"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentShare_status_expiresAt_idx" ON "CustomerDocumentShare"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentShare_expiresAt_idx" ON "CustomerDocumentShare"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentShare_createdByUserId_createdAt_idx" ON "CustomerDocumentShare"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocumentShareFile_shareId_fileAssetId_key" ON "CustomerDocumentShareFile"("shareId", "fileAssetId");

-- CreateIndex
CREATE INDEX "CustomerDocumentShareFile_shareId_createdAt_idx" ON "CustomerDocumentShareFile"("shareId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentShareFile_fileAssetId_idx" ON "CustomerDocumentShareFile"("fileAssetId");

-- CreateIndex
CREATE INDEX "CustomerDocumentShareFile_downloadCount_idx" ON "CustomerDocumentShareFile"("downloadCount");

-- AddForeignKey
ALTER TABLE "CustomerDocumentShare" ADD CONSTRAINT "CustomerDocumentShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocumentShareFile" ADD CONSTRAINT "CustomerDocumentShareFile_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "CustomerDocumentShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocumentShareFile" ADD CONSTRAINT "CustomerDocumentShareFile_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

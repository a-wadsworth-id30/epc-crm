-- CreateEnum
CREATE TYPE "CustomerDocumentPortalStatus" AS ENUM ('OPEN', 'REVOKED');

-- CreateTable
CREATE TABLE "CustomerDocumentPortal" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "CustomerDocumentPortalStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "uploadRequestId" TEXT,
    "documentShareId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDocumentPortal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocumentPortal_tokenHash_key" ON "CustomerDocumentPortal"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocumentPortal_uploadRequestId_key" ON "CustomerDocumentPortal"("uploadRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDocumentPortal_documentShareId_key" ON "CustomerDocumentPortal"("documentShareId");

-- CreateIndex
CREATE INDEX "CustomerDocumentPortal_entityType_entityId_createdAt_idx" ON "CustomerDocumentPortal"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentPortal_status_expiresAt_idx" ON "CustomerDocumentPortal"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentPortal_expiresAt_idx" ON "CustomerDocumentPortal"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerDocumentPortal_createdByUserId_createdAt_idx" ON "CustomerDocumentPortal"("createdByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerDocumentPortal" ADD CONSTRAINT "CustomerDocumentPortal_uploadRequestId_fkey" FOREIGN KEY ("uploadRequestId") REFERENCES "CustomerUploadRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocumentPortal" ADD CONSTRAINT "CustomerDocumentPortal_documentShareId_fkey" FOREIGN KEY ("documentShareId") REFERENCES "CustomerDocumentShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerDocumentPortal" ADD CONSTRAINT "CustomerDocumentPortal_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

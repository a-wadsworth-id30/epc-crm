-- CreateEnum
CREATE TYPE "CustomerUploadRequestStatus" AS ENUM ('OPEN', 'COMPLETED', 'REVOKED');

-- CreateTable
CREATE TABLE "CustomerUploadRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "message" TEXT,
    "status" "CustomerUploadRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerUploadRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUploadRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "uploadType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerUploadRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerUploadRequestFile" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fileAssetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerUploadRequestFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUploadRequest_tokenHash_key" ON "CustomerUploadRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "CustomerUploadRequest_entityType_entityId_createdAt_idx" ON "CustomerUploadRequest"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerUploadRequest_status_expiresAt_idx" ON "CustomerUploadRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CustomerUploadRequest_expiresAt_idx" ON "CustomerUploadRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "CustomerUploadRequest_createdByUserId_createdAt_idx" ON "CustomerUploadRequest"("createdByUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerUploadRequestItem_requestId_uploadType_key" ON "CustomerUploadRequestItem"("requestId", "uploadType");

-- CreateIndex
CREATE INDEX "CustomerUploadRequestItem_requestId_fulfilledAt_idx" ON "CustomerUploadRequestItem"("requestId", "fulfilledAt");

-- CreateIndex
CREATE INDEX "CustomerUploadRequestItem_uploadType_idx" ON "CustomerUploadRequestItem"("uploadType");

-- CreateIndex
CREATE INDEX "CustomerUploadRequestFile_itemId_createdAt_idx" ON "CustomerUploadRequestFile"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerUploadRequestFile_fileAssetId_idx" ON "CustomerUploadRequestFile"("fileAssetId");

-- AddForeignKey
ALTER TABLE "CustomerUploadRequest" ADD CONSTRAINT "CustomerUploadRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUploadRequestItem" ADD CONSTRAINT "CustomerUploadRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CustomerUploadRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerUploadRequestFile" ADD CONSTRAINT "CustomerUploadRequestFile_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CustomerUploadRequestItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

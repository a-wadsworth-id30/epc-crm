-- CreateEnum
CREATE TYPE "SignatureRequestStatus" AS ENUM ('DRAFT', 'SENT', 'DELIVERED', 'COMPLETED', 'DECLINED', 'VOIDED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "SignatureRecipientStatus" AS ENUM ('CREATED', 'SENT', 'DELIVERED', 'COMPLETED', 'DECLINED', 'AUTHENTICATION_FAILED', 'AUTO_RESPONDED');

-- CreateTable
CREATE TABLE "SignatureRequest" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'docusign',
    "providerEnvelopeId" TEXT,
    "providerStatus" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "sourceFileAssetId" TEXT NOT NULL,
    "signedFileAssetId" TEXT,
    "certificateFileAssetId" TEXT,
    "subject" TEXT NOT NULL,
    "message" TEXT,
    "status" "SignatureRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureRecipient" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleName" TEXT NOT NULL DEFAULT 'Customer',
    "routingOrder" INTEGER NOT NULL DEFAULT 1,
    "providerRecipientId" TEXT,
    "status" "SignatureRecipientStatus" NOT NULL DEFAULT 'CREATED',
    "deliveredAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignatureRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignatureEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'docusign',
    "eventType" TEXT NOT NULL,
    "providerStatus" TEXT,
    "occurredAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignatureRequest_providerEnvelopeId_key" ON "SignatureRequest"("providerEnvelopeId");

-- CreateIndex
CREATE INDEX "SignatureRequest_entityType_entityId_createdAt_idx" ON "SignatureRequest"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureRequest_status_createdAt_idx" ON "SignatureRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureRequest_sourceFileAssetId_createdAt_idx" ON "SignatureRequest"("sourceFileAssetId", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureRequest_signedFileAssetId_idx" ON "SignatureRequest"("signedFileAssetId");

-- CreateIndex
CREATE INDEX "SignatureRequest_certificateFileAssetId_idx" ON "SignatureRequest"("certificateFileAssetId");

-- CreateIndex
CREATE INDEX "SignatureRequest_createdByUserId_createdAt_idx" ON "SignatureRequest"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureRecipient_requestId_routingOrder_idx" ON "SignatureRecipient"("requestId", "routingOrder");

-- CreateIndex
CREATE INDEX "SignatureRecipient_email_createdAt_idx" ON "SignatureRecipient"("email", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureRecipient_status_createdAt_idx" ON "SignatureRecipient"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureEvent_requestId_createdAt_idx" ON "SignatureEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "SignatureEvent_eventType_createdAt_idx" ON "SignatureEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_sourceFileAssetId_fkey" FOREIGN KEY ("sourceFileAssetId") REFERENCES "FileAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_signedFileAssetId_fkey" FOREIGN KEY ("signedFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_certificateFileAssetId_fkey" FOREIGN KEY ("certificateFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRequest" ADD CONSTRAINT "SignatureRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureRecipient" ADD CONSTRAINT "SignatureRecipient_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignatureEvent" ADD CONSTRAINT "SignatureEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

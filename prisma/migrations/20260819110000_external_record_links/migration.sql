-- CreateTable
CREATE TABLE "ExternalRecordLink" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalType" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "integrationId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalRecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalRecordLink_provider_externalType_externalId_key" ON "ExternalRecordLink"("provider", "externalType", "externalId");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_provider_internalType_internalId_idx" ON "ExternalRecordLink"("provider", "internalType", "internalId");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_integrationId_updatedAt_idx" ON "ExternalRecordLink"("integrationId", "updatedAt");

-- CreateIndex
CREATE INDEX "ExternalRecordLink_provider_updatedAt_idx" ON "ExternalRecordLink"("provider", "updatedAt");

-- AddForeignKey
ALTER TABLE "ExternalRecordLink" ADD CONSTRAINT "ExternalRecordLink_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

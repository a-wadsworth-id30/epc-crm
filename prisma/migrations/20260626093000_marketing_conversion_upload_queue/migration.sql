-- CreateEnum
CREATE TYPE "MarketingConversionUploadStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "MarketingConversionUpload" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "conversionType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "MarketingConversionUploadStatus" NOT NULL DEFAULT 'PENDING',
    "valueCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "clickId" TEXT,
    "clickIdSource" TEXT,
    "conversionName" TEXT,
    "payload" JSONB,
    "response" JSONB,
    "message" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingConversionUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingConversionUpload_provider_status_occurredAt_idx" ON "MarketingConversionUpload"("provider", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "MarketingConversionUpload_entityType_entityId_idx" ON "MarketingConversionUpload"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "MarketingConversionUpload_occurredAt_idx" ON "MarketingConversionUpload"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingConversionUpload_provider_conversionType_entityType_entityId_key" ON "MarketingConversionUpload"("provider", "conversionType", "entityType", "entityId");

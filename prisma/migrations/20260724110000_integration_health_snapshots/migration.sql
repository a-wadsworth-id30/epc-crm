-- CreateEnum
CREATE TYPE "IntegrationHealthSnapshotStatus" AS ENUM ('READY', 'WARNING', 'ERROR', 'UNKNOWN');

-- CreateTable
CREATE TABLE "IntegrationHealthSnapshot" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "provider" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "status" "IntegrationHealthSnapshotStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "message" TEXT,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationHealthSnapshot_provider_checkedAt_idx" ON "IntegrationHealthSnapshot"("provider", "checkedAt");

-- CreateIndex
CREATE INDEX "IntegrationHealthSnapshot_integrationId_checkedAt_idx" ON "IntegrationHealthSnapshot"("integrationId", "checkedAt");

-- CreateIndex
CREATE INDEX "IntegrationHealthSnapshot_status_checkedAt_idx" ON "IntegrationHealthSnapshot"("status", "checkedAt");

-- CreateIndex
CREATE INDEX "IntegrationHealthSnapshot_capability_checkedAt_idx" ON "IntegrationHealthSnapshot"("capability", "checkedAt");

-- AddForeignKey
ALTER TABLE "IntegrationHealthSnapshot" ADD CONSTRAINT "IntegrationHealthSnapshot_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

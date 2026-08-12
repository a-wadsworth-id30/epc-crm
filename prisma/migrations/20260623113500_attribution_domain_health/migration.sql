-- AlterTable
ALTER TABLE "AttributionDomain"
ADD COLUMN "lastConfigRequestAt" TIMESTAMP(3),
ADD COLUMN "lastScriptSeenAt" TIMESTAMP(3),
ADD COLUMN "lastInstallCheckAt" TIMESTAMP(3),
ADD COLUMN "lastInstallStatus" TEXT,
ADD COLUMN "lastInstallUrl" TEXT;

-- CreateIndex
CREATE INDEX "AttributionDomain_lastConfigRequestAt_idx" ON "AttributionDomain"("lastConfigRequestAt");

-- CreateIndex
CREATE INDEX "AttributionDomain_lastScriptSeenAt_idx" ON "AttributionDomain"("lastScriptSeenAt");

-- CreateTable
CREATE TABLE "AttributionInstallCheck" (
    "id" TEXT NOT NULL,
    "attributionDomainId" TEXT,
    "domain" TEXT,
    "checkedUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "scriptReachable" BOOLEAN NOT NULL DEFAULT false,
    "scriptInstalled" BOOLEAN NOT NULL DEFAULT false,
    "correctApiBase" BOOLEAN NOT NULL DEFAULT false,
    "browserCheck" JSONB,
    "issues" JSONB,
    "checkedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributionInstallCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributionInstallCheck_attributionDomainId_createdAt_idx" ON "AttributionInstallCheck"("attributionDomainId", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionInstallCheck_domain_createdAt_idx" ON "AttributionInstallCheck"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "AttributionInstallCheck_status_createdAt_idx" ON "AttributionInstallCheck"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AttributionInstallCheck" ADD CONSTRAINT "AttributionInstallCheck_attributionDomainId_fkey" FOREIGN KEY ("attributionDomainId") REFERENCES "AttributionDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AttributionDomain" (
  "id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "label" TEXT,
  "environment" TEXT NOT NULL DEFAULT 'production',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttributionDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttributionDomain_domain_key" ON "AttributionDomain"("domain");
CREATE INDEX "AttributionDomain_isActive_environment_idx" ON "AttributionDomain"("isActive", "environment");
CREATE INDEX "AttributionDomain_domain_idx" ON "AttributionDomain"("domain");

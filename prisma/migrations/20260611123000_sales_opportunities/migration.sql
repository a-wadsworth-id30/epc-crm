CREATE TYPE "SalesStage" AS ENUM ('LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

CREATE TABLE "SalesOpportunity" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "stage" "SalesStage" NOT NULL DEFAULT 'LEAD',
  "valueCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "probability" INTEGER NOT NULL DEFAULT 10,
  "source" TEXT,
  "nextStep" TEXT,
  "expectedCloseDate" TIMESTAMP(3),
  "ownerId" TEXT,
  "companyId" TEXT,
  "contactId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SalesOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesOpportunity_stage_idx" ON "SalesOpportunity"("stage");
CREATE INDEX "SalesOpportunity_expectedCloseDate_idx" ON "SalesOpportunity"("expectedCloseDate");

ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesOpportunity" ADD CONSTRAINT "SalesOpportunity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TYPE "CustomerRelationshipStatus" AS ENUM (
  'PROSPECT',
  'ACTIVE_CUSTOMER',
  'PAST_CUSTOMER',
  'LOST_PROSPECT',
  'PARTNER',
  'OTHER'
);

CREATE TABLE "CustomerRelationshipProfile" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" "CustomerRelationshipStatus" NOT NULL DEFAULT 'PROSPECT',
  "summary" TEXT,
  "nextReviewAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerRelationshipProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerTechnologyCoverage" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "technologyName" TEXT NOT NULL,
  "installed" BOOLEAN NOT NULL DEFAULT false,
  "covered" BOOLEAN NOT NULL DEFAULT false,
  "opportunityId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerTechnologyCoverage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRelationshipProfile_contactId_key"
ON "CustomerRelationshipProfile"("contactId");

CREATE INDEX "CustomerRelationshipProfile_status_updatedAt_idx"
ON "CustomerRelationshipProfile"("status", "updatedAt");

CREATE INDEX "CustomerRelationshipProfile_nextReviewAt_idx"
ON "CustomerRelationshipProfile"("nextReviewAt");

CREATE INDEX "CustomerTechnologyCoverage_profileId_technologyName_idx"
ON "CustomerTechnologyCoverage"("profileId", "technologyName");

CREATE INDEX "CustomerTechnologyCoverage_opportunityId_idx"
ON "CustomerTechnologyCoverage"("opportunityId");

CREATE INDEX "CustomerTechnologyCoverage_installed_covered_idx"
ON "CustomerTechnologyCoverage"("installed", "covered");

ALTER TABLE "CustomerRelationshipProfile"
ADD CONSTRAINT "CustomerRelationshipProfile_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTechnologyCoverage"
ADD CONSTRAINT "CustomerTechnologyCoverage_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "CustomerRelationshipProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerTechnologyCoverage"
ADD CONSTRAINT "CustomerTechnologyCoverage_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

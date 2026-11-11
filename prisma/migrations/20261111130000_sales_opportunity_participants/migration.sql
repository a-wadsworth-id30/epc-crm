CREATE TYPE "SalesParticipantRole" AS ENUM (
  'PRIMARY_CUSTOMER',
  'JOINT_APPLICANT',
  'DECISION_MAKER',
  'BILLING_CONTACT',
  'INSTALLER',
  'TECHNICAL_CONTACT'
);

CREATE TABLE "SalesOpportunityParticipant" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "role" "SalesParticipantRole" NOT NULL DEFAULT 'JOINT_APPLICANT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesOpportunityParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesOpportunityParticipant_opportunityId_contactId_key"
  ON "SalesOpportunityParticipant"("opportunityId", "contactId");

CREATE INDEX "SalesOpportunityParticipant_opportunityId_role_idx"
  ON "SalesOpportunityParticipant"("opportunityId", "role");

CREATE INDEX "SalesOpportunityParticipant_contactId_updatedAt_idx"
  ON "SalesOpportunityParticipant"("contactId", "updatedAt");

CREATE UNIQUE INDEX "SalesOpportunityParticipant_one_primary_per_sale_idx"
  ON "SalesOpportunityParticipant"("opportunityId")
  WHERE "role" = 'PRIMARY_CUSTOMER';

ALTER TABLE "SalesOpportunityParticipant"
  ADD CONSTRAINT "SalesOpportunityParticipant_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesOpportunityParticipant"
  ADD CONSTRAINT "SalesOpportunityParticipant_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SalesOpportunityParticipant" (
  "id",
  "opportunityId",
  "contactId",
  "role",
  "createdAt",
  "updatedAt"
)
SELECT
  'sp_' || md5("id" || ':' || "contactId"),
  "id",
  "contactId",
  'PRIMARY_CUSTOMER'::"SalesParticipantRole",
  "createdAt",
  CURRENT_TIMESTAMP
FROM "SalesOpportunity"
WHERE "contactId" IS NOT NULL
ON CONFLICT ("opportunityId", "contactId") DO NOTHING;

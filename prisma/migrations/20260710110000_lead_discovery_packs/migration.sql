-- Add selector-style Discovery question types used by lead-level scope packs.
ALTER TYPE "DiscoveryAnswerType" ADD VALUE IF NOT EXISTS 'PRODUCT_SELECT';
ALTER TYPE "DiscoveryAnswerType" ADD VALUE IF NOT EXISTS 'PRODUCT_MULTI_SELECT';
ALTER TYPE "DiscoveryAnswerType" ADD VALUE IF NOT EXISTS 'CATEGORY_SELECT';
ALTER TYPE "DiscoveryAnswerType" ADD VALUE IF NOT EXISTS 'CATEGORY_MULTI_SELECT';

-- Stored approval state for Sidekick-generated write plans. Plans are inert
-- until explicitly approved and applied by a server action.
CREATE TYPE "SidekickWritePlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'APPLIED', 'REJECTED', 'FAILED');

ALTER TABLE "DiscoveryQuestion"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "supersededById" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "DiscoveryQuestion"
  ADD CONSTRAINT "DiscoveryQuestion_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "DiscoveryQuestion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DiscoveryQuestion_supersededById_idx" ON "DiscoveryQuestion"("supersededById");
CREATE INDEX "DiscoveryQuestion_archivedAt_idx" ON "DiscoveryQuestion"("archivedAt");

ALTER TABLE "OpportunityDiscoveryAnswer"
  ADD COLUMN "questionLabelSnapshot" TEXT,
  ADD COLUMN "questionHelpTextSnapshot" TEXT,
  ADD COLUMN "questionAnswerTypeSnapshot" TEXT,
  ADD COLUMN "questionAnswerModeSnapshot" TEXT,
  ADD COLUMN "questionVersionSnapshot" INTEGER,
  ADD COLUMN "questionOptionsSnapshot" JSONB;

UPDATE "OpportunityDiscoveryAnswer" AS answer
SET
  "questionLabelSnapshot" = question."label",
  "questionHelpTextSnapshot" = question."helpText",
  "questionAnswerTypeSnapshot" = question."answerType"::TEXT,
  "questionAnswerModeSnapshot" = question."answerMode"::TEXT,
  "questionVersionSnapshot" = question."version",
  "questionOptionsSnapshot" = question."options"
FROM "DiscoveryQuestion" AS question
WHERE answer."questionId" = question."id";

CREATE TABLE "SidekickWritePlan" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'DISCOVERY_PACK',
  "prompt" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "SidekickWritePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "plan" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "failureMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SidekickWritePlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SidekickWritePlan"
  ADD CONSTRAINT "SidekickWritePlan_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SidekickWritePlan"
  ADD CONSTRAINT "SidekickWritePlan_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SidekickWritePlan_type_status_createdAt_idx" ON "SidekickWritePlan"("type", "status", "createdAt");
CREATE INDEX "SidekickWritePlan_createdByUserId_createdAt_idx" ON "SidekickWritePlan"("createdByUserId", "createdAt");
CREATE INDEX "SidekickWritePlan_approvedByUserId_approvedAt_idx" ON "SidekickWritePlan"("approvedByUserId", "approvedAt");

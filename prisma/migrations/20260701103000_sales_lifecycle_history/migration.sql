CREATE TYPE "SalesLifecycleEventType" AS ENUM ('CREATED', 'STAGE_CHANGED', 'CONTACTED', 'LOST_REASON_UPDATED');

ALTER TABLE "SalesOpportunity"
  ADD COLUMN "firstContactedAt" TIMESTAMP(3),
  ADD COLUMN "stageChangedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "lostReason" TEXT,
  ADD COLUMN "lostReasonNotes" TEXT;

UPDATE "SalesOpportunity"
SET "stageChangedAt" = "updatedAt"
WHERE "stageChangedAt" IS NULL;

UPDATE "SalesOpportunity"
SET "closedAt" = "updatedAt"
WHERE "stage" IN ('WON', 'LOST') AND "closedAt" IS NULL;

ALTER TABLE "SalesOpportunity"
  ALTER COLUMN "stageChangedAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "stageChangedAt" SET NOT NULL;

CREATE TABLE "SalesLifecycleEvent" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "eventType" "SalesLifecycleEventType" NOT NULL DEFAULT 'STAGE_CHANGED',
  "fromStage" "SalesStage",
  "toStage" "SalesStage",
  "lostReason" TEXT,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesLifecycleEvent_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesLifecycleEvent" (
  "id",
  "opportunityId",
  "eventType",
  "toStage",
  "occurredAt",
  "metadata",
  "createdAt"
)
SELECT
  'sales_lifecycle_' || substr(md5("id"), 1, 24),
  "id",
  'CREATED',
  "stage",
  COALESCE("createdAt", "stageChangedAt", CURRENT_TIMESTAMP),
  jsonb_build_object('source', 'migration-backfill', 'currentStage', "stage"),
  CURRENT_TIMESTAMP
FROM "SalesOpportunity";

CREATE INDEX "SalesOpportunity_stageChangedAt_idx" ON "SalesOpportunity"("stageChangedAt");
CREATE INDEX "SalesOpportunity_closedAt_idx" ON "SalesOpportunity"("closedAt");
CREATE INDEX "SalesOpportunity_firstContactedAt_idx" ON "SalesOpportunity"("firstContactedAt");
CREATE INDEX "SalesOpportunity_lostReason_idx" ON "SalesOpportunity"("lostReason");

CREATE INDEX "SalesLifecycleEvent_opportunityId_occurredAt_idx" ON "SalesLifecycleEvent"("opportunityId", "occurredAt");
CREATE INDEX "SalesLifecycleEvent_eventType_occurredAt_idx" ON "SalesLifecycleEvent"("eventType", "occurredAt");
CREATE INDEX "SalesLifecycleEvent_toStage_occurredAt_idx" ON "SalesLifecycleEvent"("toStage", "occurredAt");
CREATE INDEX "SalesLifecycleEvent_userId_occurredAt_idx" ON "SalesLifecycleEvent"("userId", "occurredAt");
CREATE INDEX "SalesLifecycleEvent_lostReason_idx" ON "SalesLifecycleEvent"("lostReason");

ALTER TABLE "SalesLifecycleEvent"
  ADD CONSTRAINT "SalesLifecycleEvent_opportunityId_fkey"
  FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesLifecycleEvent"
  ADD CONSTRAINT "SalesLifecycleEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SalesPipelineStage" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "bucket" "SalesStage" NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "defaultProbability" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isClosed" BOOLEAN NOT NULL DEFAULT false,
  "isWon" BOOLEAN NOT NULL DEFAULT false,
  "isLost" BOOLEAN NOT NULL DEFAULT false,
  "color" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesPipelineStage_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SalesPipelineStage" (
  "id",
  "name",
  "slug",
  "bucket",
  "sortOrder",
  "defaultProbability",
  "isActive",
  "isClosed",
  "isWon",
  "isLost",
  "color",
  "description",
  "metadata"
)
VALUES
  (
    'sales-pipeline-stage-lead',
    'Lead',
    'lead',
    'LEAD',
    10,
    10,
    true,
    false,
    false,
    false,
    '#6B7280',
    'New enquiry or unqualified sales opportunity.',
    '{"default": true, "legacyStage": "LEAD"}'
  ),
  (
    'sales-pipeline-stage-qualified',
    'Qualified',
    'qualified',
    'QUALIFIED',
    20,
    25,
    true,
    false,
    false,
    false,
    '#2563EB',
    'Qualified opportunity with confirmed commercial potential.',
    '{"default": true, "legacyStage": "QUALIFIED"}'
  ),
  (
    'sales-pipeline-stage-proposal',
    'Proposal',
    'proposal',
    'PROPOSAL',
    30,
    55,
    true,
    false,
    false,
    false,
    '#7C3AED',
    'Proposal or quote has been issued.',
    '{"default": true, "legacyStage": "PROPOSAL"}'
  ),
  (
    'sales-pipeline-stage-negotiation',
    'Negotiation',
    'negotiation',
    'NEGOTIATION',
    40,
    75,
    true,
    false,
    false,
    false,
    '#D97706',
    'Commercial terms are being discussed.',
    '{"default": true, "legacyStage": "NEGOTIATION"}'
  ),
  (
    'sales-pipeline-stage-won',
    'Won',
    'won',
    'WON',
    50,
    100,
    true,
    true,
    true,
    false,
    '#059669',
    'Closed won opportunity.',
    '{"default": true, "legacyStage": "WON"}'
  ),
  (
    'sales-pipeline-stage-lost',
    'Lost',
    'lost',
    'LOST',
    60,
    0,
    true,
    true,
    false,
    true,
    '#DC2626',
    'Closed lost opportunity.',
    '{"default": true, "legacyStage": "LOST"}'
  )
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "SalesOpportunity"
  ADD COLUMN "salesPipelineStageId" TEXT;

ALTER TABLE "SalesLifecycleEvent"
  ADD COLUMN "fromPipelineStageId" TEXT,
  ADD COLUMN "toPipelineStageId" TEXT;

UPDATE "SalesOpportunity"
SET "salesPipelineStageId" = CASE "stage"
  WHEN 'LEAD' THEN 'sales-pipeline-stage-lead'
  WHEN 'QUALIFIED' THEN 'sales-pipeline-stage-qualified'
  WHEN 'PROPOSAL' THEN 'sales-pipeline-stage-proposal'
  WHEN 'NEGOTIATION' THEN 'sales-pipeline-stage-negotiation'
  WHEN 'WON' THEN 'sales-pipeline-stage-won'
  WHEN 'LOST' THEN 'sales-pipeline-stage-lost'
  ELSE NULL
END;

UPDATE "SalesLifecycleEvent"
SET
  "fromPipelineStageId" = CASE "fromStage"
    WHEN 'LEAD' THEN 'sales-pipeline-stage-lead'
    WHEN 'QUALIFIED' THEN 'sales-pipeline-stage-qualified'
    WHEN 'PROPOSAL' THEN 'sales-pipeline-stage-proposal'
    WHEN 'NEGOTIATION' THEN 'sales-pipeline-stage-negotiation'
    WHEN 'WON' THEN 'sales-pipeline-stage-won'
    WHEN 'LOST' THEN 'sales-pipeline-stage-lost'
    ELSE NULL
  END,
  "toPipelineStageId" = CASE "toStage"
    WHEN 'LEAD' THEN 'sales-pipeline-stage-lead'
    WHEN 'QUALIFIED' THEN 'sales-pipeline-stage-qualified'
    WHEN 'PROPOSAL' THEN 'sales-pipeline-stage-proposal'
    WHEN 'NEGOTIATION' THEN 'sales-pipeline-stage-negotiation'
    WHEN 'WON' THEN 'sales-pipeline-stage-won'
    WHEN 'LOST' THEN 'sales-pipeline-stage-lost'
    ELSE NULL
  END;

CREATE UNIQUE INDEX "SalesPipelineStage_slug_key" ON "SalesPipelineStage"("slug");
CREATE INDEX "SalesPipelineStage_bucket_sortOrder_idx" ON "SalesPipelineStage"("bucket", "sortOrder");
CREATE INDEX "SalesPipelineStage_isActive_sortOrder_idx" ON "SalesPipelineStage"("isActive", "sortOrder");
CREATE INDEX "SalesOpportunity_salesPipelineStageId_idx" ON "SalesOpportunity"("salesPipelineStageId");
CREATE INDEX "SalesLifecycleEvent_toPipelineStageId_occurredAt_idx" ON "SalesLifecycleEvent"("toPipelineStageId", "occurredAt");
CREATE INDEX "SalesLifecycleEvent_fromPipelineStageId_idx" ON "SalesLifecycleEvent"("fromPipelineStageId");

ALTER TABLE "SalesOpportunity"
  ADD CONSTRAINT "SalesOpportunity_salesPipelineStageId_fkey"
  FOREIGN KEY ("salesPipelineStageId") REFERENCES "SalesPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesLifecycleEvent"
  ADD CONSTRAINT "SalesLifecycleEvent_fromPipelineStageId_fkey"
  FOREIGN KEY ("fromPipelineStageId") REFERENCES "SalesPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesLifecycleEvent"
  ADD CONSTRAINT "SalesLifecycleEvent_toPipelineStageId_fkey"
  FOREIGN KEY ("toPipelineStageId") REFERENCES "SalesPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Align EPC's customer-facing sales pipeline to Enquiries -> Opportunities -> Projects.
-- The legacy SalesStage enum buckets remain in place for reporting and automation.

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
  "goal",
  "metadata"
)
VALUES
  (
    'sales-pipeline-stage-lead',
    'Enquiries',
    'lead',
    'LEAD',
    10,
    10,
    true,
    false,
    false,
    false,
    '#2563EB',
    'Marketed leads land here and are nurtured until engaged.',
    'Capture source, contact route and the next follow-up so marketed enquiries are nurtured.',
    '{"default": true, "legacyStage": "LEAD", "epcStage": "Enquiries"}'
  ),
  (
    'sales-pipeline-stage-proposal',
    'Opportunities',
    'proposal',
    'PROPOSAL',
    20,
    45,
    true,
    false,
    false,
    false,
    '#0BA5EC',
    'Engaged enquiries that are being scoped, quoted or followed up.',
    'Confirm scope, quote status, value and the next decision step.',
    '{"default": true, "legacyStage": "PROPOSAL", "epcStage": "Opportunities"}'
  ),
  (
    'sales-pipeline-stage-won',
    'Projects',
    'won',
    'WON',
    30,
    100,
    true,
    true,
    true,
    false,
    '#059669',
    'Confirmed orders that have become customer projects.',
    'Track confirmed customer orders after the opportunity has been accepted.',
    '{"default": true, "legacyStage": "WON", "epcStage": "Projects"}'
  ),
  (
    'sales-pipeline-stage-lost',
    'Lost',
    'lost',
    'LOST',
    40,
    0,
    true,
    true,
    false,
    true,
    '#DC2626',
    'Closed lost opportunity.',
    'Keep closed-lost sales available for reporting without showing them as active work.',
    '{"default": true, "legacyStage": "LOST", "epcStage": "Lost"}'
  )
ON CONFLICT ("id") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "bucket" = EXCLUDED."bucket",
  "sortOrder" = EXCLUDED."sortOrder",
  "defaultProbability" = EXCLUDED."defaultProbability",
  "isActive" = EXCLUDED."isActive",
  "isClosed" = EXCLUDED."isClosed",
  "isWon" = EXCLUDED."isWon",
  "isLost" = EXCLUDED."isLost",
  "color" = EXCLUDED."color",
  "description" = EXCLUDED."description",
  "goal" = EXCLUDED."goal",
  "metadata" = COALESCE("SalesPipelineStage"."metadata", '{}'::jsonb) || EXCLUDED."metadata",
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "SalesPipelineStage"
SET
  "name" = 'Qualified (legacy)',
  "sortOrder" = 90,
  "defaultProbability" = 25,
  "isActive" = false,
  "isClosed" = false,
  "isWon" = false,
  "isLost" = false,
  "color" = '#64748B',
  "description" = 'Legacy bucket retained for historical reporting compatibility.',
  "goal" = NULL,
  "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"default": true, "legacyStage": "QUALIFIED", "epcLegacyStage": true}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'sales-pipeline-stage-qualified';

UPDATE "SalesPipelineStage"
SET
  "name" = 'Negotiation (legacy)',
  "sortOrder" = 100,
  "defaultProbability" = 75,
  "isActive" = false,
  "isClosed" = false,
  "isWon" = false,
  "isLost" = false,
  "color" = '#64748B',
  "description" = 'Legacy bucket retained for historical reporting compatibility.',
  "goal" = NULL,
  "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"default": true, "legacyStage": "NEGOTIATION", "epcLegacyStage": true}'::jsonb,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'sales-pipeline-stage-negotiation';

UPDATE "SalesOpportunity"
SET
  "stage" = 'PROPOSAL',
  "salesPipelineStageId" = 'sales-pipeline-stage-proposal',
  "probability" = CASE
    WHEN "probability" IN (25, 55, 75) THEN 45
    ELSE "probability"
  END
WHERE
  "stage" NOT IN ('WON', 'LOST')
  AND (
    "stage" IN ('QUALIFIED', 'PROPOSAL', 'NEGOTIATION')
    OR "salesPipelineStageId" IN (
      'sales-pipeline-stage-qualified',
      'sales-pipeline-stage-proposal',
      'sales-pipeline-stage-negotiation'
    )
  );

UPDATE "SalesOpportunity"
SET "salesPipelineStageId" = 'sales-pipeline-stage-lead'
WHERE "stage" = 'LEAD'
  AND (
    "salesPipelineStageId" IS NULL
    OR "salesPipelineStageId" = 'sales-pipeline-stage-lead'
  );

UPDATE "SalesOpportunity"
SET "salesPipelineStageId" = 'sales-pipeline-stage-won'
WHERE "stage" = 'WON';

UPDATE "SalesOpportunity"
SET "salesPipelineStageId" = 'sales-pipeline-stage-lost'
WHERE "stage" = 'LOST';

UPDATE "DiscoveryTemplate"
SET "salesPipelineStageId" = 'sales-pipeline-stage-proposal'
WHERE "salesPipelineStageId" IN (
  'sales-pipeline-stage-qualified',
  'sales-pipeline-stage-negotiation'
);

UPDATE "SalesAutomationRule"
SET "salesPipelineStageId" = 'sales-pipeline-stage-proposal'
WHERE "salesPipelineStageId" IN (
  'sales-pipeline-stage-qualified',
  'sales-pipeline-stage-negotiation'
);

UPDATE "SalesAutomationRule"
SET "config" = jsonb_set(
  COALESCE("config", '{}'::jsonb),
  '{targetStageId}',
  '"sales-pipeline-stage-proposal"'::jsonb,
  false
)
WHERE COALESCE("config" ->> 'targetStageId', '') IN (
  'sales-pipeline-stage-qualified',
  'sales-pipeline-stage-negotiation'
);

UPDATE "SalesAutomationRun"
SET "metadata" = jsonb_set(
  COALESCE("metadata", '{}'::jsonb),
  '{suggestedStageId}',
  '"sales-pipeline-stage-proposal"'::jsonb,
  false
)
WHERE COALESCE("metadata" ->> 'suggestedStageId', '') IN (
  'sales-pipeline-stage-qualified',
  'sales-pipeline-stage-negotiation'
);

UPDATE "CrmSettings"
SET "salesDefaults" = jsonb_set(
  COALESCE("salesDefaults", '{}'::jsonb),
  '{defaultSalesPipelineStageId}',
  '"sales-pipeline-stage-lead"'::jsonb,
  true
)
WHERE COALESCE("salesDefaults" ->> 'defaultSalesPipelineStageId', '') IN (
  'sales-pipeline-stage-qualified',
  'sales-pipeline-stage-proposal',
  'sales-pipeline-stage-negotiation'
);

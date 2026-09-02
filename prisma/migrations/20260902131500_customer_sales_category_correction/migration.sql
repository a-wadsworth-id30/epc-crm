-- Separate customer sales category from granular sales pipeline stage names.
CREATE TYPE "CustomerSalesCategory" AS ENUM ('ENQUIRY', 'OPPORTUNITY', 'PROJECT');

ALTER TABLE "SalesOpportunity"
ADD COLUMN "customerSalesCategory" "CustomerSalesCategory" NOT NULL DEFAULT 'ENQUIRY';

ALTER TABLE "SalesPipelineStage"
ADD COLUMN "customerSalesCategory" "CustomerSalesCategory" NOT NULL DEFAULT 'ENQUIRY';

UPDATE "SalesPipelineStage"
SET "customerSalesCategory" = CASE
  WHEN "bucket" = 'WON'::"SalesStage" THEN 'PROJECT'::"CustomerSalesCategory"
  WHEN "bucket" = 'LEAD'::"SalesStage" THEN 'ENQUIRY'::"CustomerSalesCategory"
  ELSE 'OPPORTUNITY'::"CustomerSalesCategory"
END;

INSERT INTO "SalesPipelineStage" (
  "id",
  "name",
  "slug",
  "bucket",
  "customerSalesCategory",
  "sortOrder",
  "defaultProbability",
  "isActive",
  "isClosed",
  "isWon",
  "isLost",
  "color",
  "description",
  "metadata",
  "createdAt",
  "updatedAt"
) VALUES
  (
    'sales-pipeline-stage-lead',
    'Lead',
    'lead',
    'LEAD'::"SalesStage",
    'ENQUIRY'::"CustomerSalesCategory",
    10,
    10,
    true,
    false,
    false,
    false,
    '#6B7280',
    'New enquiry or unqualified sales opportunity.',
    '{"default": true, "legacyStage": "LEAD"}'::jsonb,
    now(),
    now()
  ),
  (
    'sales-pipeline-stage-qualified',
    'Qualified',
    'qualified',
    'QUALIFIED'::"SalesStage",
    'OPPORTUNITY'::"CustomerSalesCategory",
    20,
    25,
    true,
    false,
    false,
    false,
    '#2563EB',
    'Qualified customer ready to scope or quote.',
    '{"default": true, "legacyStage": "QUALIFIED"}'::jsonb,
    now(),
    now()
  ),
  (
    'sales-pipeline-stage-proposal',
    'Proposal',
    'proposal',
    'PROPOSAL'::"SalesStage",
    'OPPORTUNITY'::"CustomerSalesCategory",
    30,
    45,
    true,
    false,
    false,
    false,
    '#0BA5EC',
    'Proposal or quote issued to the customer.',
    '{"default": true, "legacyStage": "PROPOSAL"}'::jsonb,
    now(),
    now()
  ),
  (
    'sales-pipeline-stage-negotiation',
    'Negotiation',
    'negotiation',
    'NEGOTIATION'::"SalesStage",
    'OPPORTUNITY'::"CustomerSalesCategory",
    40,
    75,
    true,
    false,
    false,
    false,
    '#D97706',
    'Customer is negotiating scope, price or timing.',
    '{"default": true, "legacyStage": "NEGOTIATION"}'::jsonb,
    now(),
    now()
  ),
  (
    'sales-pipeline-stage-won',
    'Won',
    'won',
    'WON'::"SalesStage",
    'PROJECT'::"CustomerSalesCategory",
    50,
    100,
    true,
    true,
    true,
    false,
    '#059669',
    'Confirmed order that has become a customer project.',
    '{"default": true, "legacyStage": "WON"}'::jsonb,
    now(),
    now()
  ),
  (
    'sales-pipeline-stage-lost',
    'Lost',
    'lost',
    'LOST'::"SalesStage",
    'OPPORTUNITY'::"CustomerSalesCategory",
    60,
    0,
    true,
    true,
    false,
    true,
    '#DC2626',
    'Closed lost opportunity.',
    '{"default": true, "legacyStage": "LOST"}'::jsonb,
    now(),
    now()
  )
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "bucket" = EXCLUDED."bucket",
  "customerSalesCategory" = EXCLUDED."customerSalesCategory",
  "sortOrder" = EXCLUDED."sortOrder",
  "defaultProbability" = EXCLUDED."defaultProbability",
  "isActive" = EXCLUDED."isActive",
  "isClosed" = EXCLUDED."isClosed",
  "isWon" = EXCLUDED."isWon",
  "isLost" = EXCLUDED."isLost",
  "color" = EXCLUDED."color",
  "description" = EXCLUDED."description",
  "metadata" = (
    COALESCE("SalesPipelineStage"."metadata", '{}'::jsonb)
    - 'epcStage'
    - 'epcLegacyStage'
  ) || EXCLUDED."metadata",
  "updatedAt" = now();

UPDATE "SalesOpportunity" AS opportunity
SET "customerSalesCategory" = stage."customerSalesCategory"
FROM "SalesPipelineStage" AS stage
WHERE opportunity."salesPipelineStageId" = stage."id";

UPDATE "SalesOpportunity"
SET "customerSalesCategory" = CASE
  WHEN "stage" = 'WON'::"SalesStage" THEN 'PROJECT'::"CustomerSalesCategory"
  WHEN "stage" = 'LEAD'::"SalesStage" THEN 'ENQUIRY'::"CustomerSalesCategory"
  ELSE 'OPPORTUNITY'::"CustomerSalesCategory"
END
WHERE "salesPipelineStageId" IS NULL;

CREATE INDEX "SalesOpportunity_customerSalesCategory_updatedAt_idx"
ON "SalesOpportunity"("customerSalesCategory", "updatedAt");

CREATE INDEX "SalesPipelineStage_customerSalesCategory_isActive_sortOrder_idx"
ON "SalesPipelineStage"("customerSalesCategory", "isActive", "sortOrder");

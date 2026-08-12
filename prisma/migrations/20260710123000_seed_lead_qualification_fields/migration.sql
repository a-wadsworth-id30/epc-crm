-- Keep Lead qualification as the first lead-level Discovery pack and seed its
-- current fields without deleting old questions or historical answers.
INSERT INTO "DiscoveryQuestion" (
  "id",
  "slug",
  "label",
  "helpText",
  "scope",
  "answerType",
  "answerMode",
  "options",
  "defaultRequired",
  "dedupeKey",
  "sortOrder",
  "isActive",
  "updatedAt"
) VALUES
  (
    'discovery-question-products-required',
    'products-required',
    'Products',
    'Select from the product catalogue. Selected products are attached to the lead and can pull in product discovery packs.',
    'OPPORTUNITY',
    'PRODUCT_MULTI_SELECT',
    'MULTIPLE_UNLIMITED',
    NULL,
    true,
    'products-required',
    5,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-categories-required',
    'categories-required',
    'Categories',
    'Use this when the customer knows the broad area before the exact product is confirmed.',
    'OPPORTUNITY',
    'CATEGORY_MULTI_SELECT',
    'MULTIPLE_UNLIMITED',
    NULL,
    false,
    'categories-required',
    8,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-customer-sells-provides',
    'customer-sells-provides',
    'What they sell/provide?',
    'Plain-English summary of what the customer sells, provides or needs to promote.',
    'OPPORTUNITY',
    'TEXT',
    'SINGLE',
    NULL,
    true,
    'customer-sells-provides',
    10,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-budget-range',
    'budget-range',
    'Budget',
    'Lead-level budget range. Use the closest option or select another currency/to confirm.',
    'OPPORTUNITY',
    'SINGLE_SELECT',
    'SINGLE',
    '["Under £2,500","£2,500-£5,000","£5,000-£10,000","£10,000-£20,000","£20,000+","Other currency / to confirm"]'::jsonb,
    true,
    'budget-range',
    20,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-timeframe',
    'timeframe',
    'Timeframe',
    'Lead-level project urgency and target timing.',
    'OPPORTUNITY',
    'SINGLE_SELECT',
    'SINGLE',
    '["Within the next 3 months","Within the next 6 months","Not sure yet","We need urgent help"]'::jsonb,
    true,
    'timeframe',
    30,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-project-notes',
    'project-notes',
    'Project notes',
    'Capture any extra context for the discovery call or quote.',
    'OPPORTUNITY',
    'LONG_TEXT',
    'SINGLE',
    NULL,
    false,
    'project-notes',
    40,
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "helpText" = EXCLUDED."helpText",
  "scope" = EXCLUDED."scope",
  "answerType" = EXCLUDED."answerType",
  "answerMode" = EXCLUDED."answerMode",
  "options" = EXCLUDED."options",
  "defaultRequired" = EXCLUDED."defaultRequired",
  "dedupeKey" = EXCLUDED."dedupeKey",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DiscoveryTemplate" (
  "id",
  "name",
  "slug",
  "scope",
  "description",
  "metadata",
  "isActive",
  "updatedAt"
) VALUES (
  'discovery-template-lead-qualification',
  'Lead qualification',
  'lead-qualification',
  'LEAD',
  'Lead-level scope, products, budget and timing that appear on every opportunity.',
  '{"seeded":true,"sortOrder":10}'::jsonb,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "scope" = EXCLUDED."scope",
  "description" = EXCLUDED."description",
  "metadata" = EXCLUDED."metadata",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DiscoveryTemplateQuestion" (
  "id",
  "templateId",
  "questionId",
  "sortOrder",
  "required",
  "updatedAt"
)
SELECT
  'lead-qualification-' || question."slug",
  template."id",
  question."id",
  desired."sortOrder",
  question."defaultRequired",
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('products-required', 10),
    ('categories-required', 20),
    ('customer-sells-provides', 30),
    ('budget-range', 40),
    ('timeframe', 50),
    ('project-notes', 60)
) AS desired("slug", "sortOrder")
JOIN "DiscoveryTemplate" AS template ON template."slug" = 'lead-qualification'
JOIN "DiscoveryQuestion" AS question ON question."slug" = desired."slug"
ON CONFLICT ("templateId", "questionId") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "required" = EXCLUDED."required",
  "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "DiscoveryTemplateQuestion" assignment
USING "DiscoveryTemplate" template, "DiscoveryQuestion" question
WHERE assignment."templateId" = template."id"
  AND assignment."questionId" = question."id"
  AND template."slug" = 'lead-qualification'
  AND question."slug" NOT IN (
    'products-required',
    'categories-required',
    'customer-sells-provides',
    'budget-range',
    'timeframe',
    'project-notes'
  );

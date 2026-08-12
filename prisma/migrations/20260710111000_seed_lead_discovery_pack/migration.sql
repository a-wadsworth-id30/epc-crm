-- Seed lead-level Discovery after selector enum values have committed.
INSERT INTO "DiscoveryQuestion" (
  "id",
  "slug",
  "label",
  "helpText",
  "scope",
  "answerType",
  "answerMode",
  "defaultRequired",
  "dedupeKey",
  "sortOrder",
  "isActive",
  "updatedAt"
) VALUES
  (
    'discovery-question-products-required',
    'products-required',
    'Which products or services is the client interested in?',
    'Select from the product catalogue. Selected products are attached to the lead and can pull in product discovery packs.',
    'OPPORTUNITY',
    'PRODUCT_MULTI_SELECT',
    'MULTIPLE_UNLIMITED',
    true,
    'products-required',
    5,
    true,
    CURRENT_TIMESTAMP
  ),
  (
    'discovery-question-categories-required',
    'categories-required',
    'Which product categories are relevant?',
    'Use this when the customer knows the broad area before the exact product is confirmed.',
    'OPPORTUNITY',
    'CATEGORY_MULTI_SELECT',
    'MULTIPLE_UNLIMITED',
    false,
    'categories-required',
    8,
    true,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "helpText" = EXCLUDED."helpText",
  "scope" = EXCLUDED."scope",
  "answerType" = EXCLUDED."answerType",
  "answerMode" = EXCLUDED."answerMode",
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
  "isActive",
  "updatedAt"
) VALUES (
  'discovery-template-lead-qualification',
  'Lead qualification',
  'lead-qualification',
  'LEAD',
  'Lead-level scope, products, budget and timing that appear on every opportunity.',
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "scope" = EXCLUDED."scope",
  "description" = EXCLUDED."description",
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
    ('budget', 30),
    ('timeline', 40),
    ('decision-maker', 50),
    ('existing-website', 60)
) AS desired("slug", "sortOrder")
JOIN "DiscoveryTemplate" AS template ON template."slug" = 'lead-qualification'
JOIN "DiscoveryQuestion" AS question ON question."slug" = desired."slug"
ON CONFLICT ("templateId", "questionId") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "required" = EXCLUDED."required",
  "updatedAt" = CURRENT_TIMESTAMP;

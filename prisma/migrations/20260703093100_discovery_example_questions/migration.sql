INSERT INTO "ProductCategory" ("id", "name", "slug", "description", "sortOrder", "updatedAt")
VALUES
  ('product-category-websites', 'Websites', 'websites', 'Website, ecommerce and web application services.', 10, CURRENT_TIMESTAMP),
  ('product-category-brand', 'Brand', 'brand', 'Brand strategy, identity and design services.', 20, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = COALESCE("ProductCategory"."description", EXCLUDED."description"),
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "Product" ("id", "name", "slug", "type", "categoryId", "sku", "description", "sortOrder", "updatedAt")
VALUES
  ('product-ecommerce-website', 'Ecommerce website', 'ecommerce-website', 'SERVICE', (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'websites'), 'WEB-ECOM', 'Discovery, design and build for ecommerce websites.', 10, CURRENT_TIMESTAMP),
  ('product-brand-identity', 'Brand identity', 'brand-identity', 'SERVICE', (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'brand'), 'BRAND-ID', 'Brand identity, guidelines and visual design work.', 20, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "categoryId" = EXCLUDED."categoryId",
  "sku" = COALESCE("Product"."sku", EXCLUDED."sku"),
  "description" = COALESCE("Product"."description", EXCLUDED."description"),
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "DiscoveryTemplate" ("id", "name", "slug", "scope", "description", "updatedAt")
VALUES
  ('discovery-template-ecommerce', 'Ecommerce discovery', 'ecommerce-discovery', 'PRODUCT', 'Questions required when ecommerce is attached to an opportunity.', CURRENT_TIMESTAMP),
  ('discovery-template-branding', 'Branding discovery', 'branding-discovery', 'PRODUCT', 'Questions required for branding and identity work.', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "scope" = EXCLUDED."scope",
  "description" = COALESCE("DiscoveryTemplate"."description", EXCLUDED."description"),
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ProductDiscoveryTemplate" ("id", "productId", "templateId")
SELECT 'product-template-ecommerce', p."id", t."id"
FROM "Product" p, "DiscoveryTemplate" t
WHERE p."slug" = 'ecommerce-website'
  AND t."slug" = 'ecommerce-discovery'
ON CONFLICT ("productId", "templateId") DO NOTHING;

INSERT INTO "ProductDiscoveryTemplate" ("id", "productId", "templateId")
SELECT 'product-template-branding', p."id", t."id"
FROM "Product" p, "DiscoveryTemplate" t
WHERE p."slug" = 'brand-identity'
  AND t."slug" = 'branding-discovery'
ON CONFLICT ("productId", "templateId") DO NOTHING;

INSERT INTO "DiscoveryQuestion" (
  "id", "slug", "label", "helpText", "scope", "answerType", "answerMode", "maxAnswers",
  "options", "defaultRequired", "dedupeKey", "sortOrder", "updatedAt"
)
VALUES
  ('discovery-question-example-sites', 'example-sites', 'Which example sites do you like?', 'Capture reference URLs. Start with one URL, then add more if the customer has more examples.', 'PRODUCT', 'URL', 'MULTIPLE_UNLIMITED', NULL, NULL, false, 'example-sites', 110, CURRENT_TIMESTAMP),
  ('discovery-question-ecommerce-platform', 'ecommerce-platform', 'Which ecommerce platform is currently used or preferred?', 'Shopify, WooCommerce, Magento, custom or undecided.', 'PRODUCT', 'SINGLE_SELECT', 'SINGLE', NULL, '["Shopify","WooCommerce","Magento","Custom","Not sure"]'::jsonb, true, 'ecommerce-platform', 120, CURRENT_TIMESTAMP),
  ('discovery-question-product-count', 'product-count', 'How many products need to be sold online?', 'Approximate number is fine for discovery.', 'PRODUCT', 'NUMBER', 'SINGLE', NULL, NULL, true, 'product-count', 130, CURRENT_TIMESTAMP),
  ('discovery-question-payment-shipping', 'payment-shipping', 'Which payment and shipping requirements are needed?', 'Examples: Stripe, PayPal, subscriptions, click and collect, courier rules.', 'PRODUCT', 'LONG_TEXT', 'SINGLE', NULL, NULL, false, 'payment-shipping', 140, CURRENT_TIMESTAMP),
  ('discovery-question-brand-positioning', 'brand-positioning', 'How should the brand be perceived?', 'Capture the desired tone and positioning.', 'PRODUCT', 'LONG_TEXT', 'SINGLE', NULL, NULL, true, 'brand-positioning', 210, CURRENT_TIMESTAMP),
  ('discovery-question-brand-assets', 'brand-assets', 'Which brand assets are needed?', 'Logo, colour palette, typography, icons, social templates, brand guidelines.', 'PRODUCT', 'MULTI_SELECT', 'MULTIPLE_MAX', 6, '["Logo","Colour palette","Typography","Icons","Social templates","Brand guidelines"]'::jsonb, true, 'brand-assets', 220, CURRENT_TIMESTAMP),
  ('discovery-question-competitor-brands', 'competitor-brands', 'Which competitor or inspiration brands should we review?', 'Capture competitor or inspiration URLs. Start with one URL, then add more if needed.', 'PRODUCT', 'URL', 'MULTIPLE_UNLIMITED', NULL, NULL, false, 'competitor-brands', 230, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "label" = EXCLUDED."label",
  "helpText" = EXCLUDED."helpText",
  "scope" = EXCLUDED."scope",
  "answerType" = EXCLUDED."answerType",
  "answerMode" = EXCLUDED."answerMode",
  "maxAnswers" = EXCLUDED."maxAnswers",
  "options" = EXCLUDED."options",
  "defaultRequired" = EXCLUDED."defaultRequired",
  "dedupeKey" = EXCLUDED."dedupeKey",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH ecommerce_templates AS (
  SELECT "id"
  FROM "DiscoveryTemplate"
  WHERE lower("slug") LIKE '%commerce%'
     OR lower("name") LIKE '%commerce%'
),
ecommerce_questions AS (
  SELECT "id", "slug"
  FROM "DiscoveryQuestion"
  WHERE "slug" IN ('example-sites', 'ecommerce-platform', 'product-count', 'payment-shipping')
)
INSERT INTO "DiscoveryTemplateQuestion" ("id", "templateId", "questionId", "sortOrder", "required", "updatedAt")
SELECT
  'template-question-' || t."id" || '-' || q."slug",
  t."id",
  q."id",
  CASE q."slug"
    WHEN 'example-sites' THEN 10
    WHEN 'ecommerce-platform' THEN 20
    WHEN 'product-count' THEN 30
    ELSE 40
  END,
  q."slug" IN ('ecommerce-platform', 'product-count'),
  CURRENT_TIMESTAMP
FROM ecommerce_templates t
CROSS JOIN ecommerce_questions q
ON CONFLICT ("templateId", "questionId") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "required" = EXCLUDED."required",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH branding_templates AS (
  SELECT "id"
  FROM "DiscoveryTemplate"
  WHERE lower("slug") LIKE '%brand%'
     OR lower("name") LIKE '%brand%'
),
branding_questions AS (
  SELECT "id", "slug"
  FROM "DiscoveryQuestion"
  WHERE "slug" IN ('example-sites', 'brand-positioning', 'brand-assets', 'competitor-brands')
)
INSERT INTO "DiscoveryTemplateQuestion" ("id", "templateId", "questionId", "sortOrder", "required", "updatedAt")
SELECT
  'template-question-' || t."id" || '-' || q."slug",
  t."id",
  q."id",
  CASE q."slug"
    WHEN 'example-sites' THEN 10
    WHEN 'brand-positioning' THEN 20
    WHEN 'brand-assets' THEN 30
    ELSE 40
  END,
  q."slug" IN ('brand-positioning', 'brand-assets'),
  CURRENT_TIMESTAMP
FROM branding_templates t
CROSS JOIN branding_questions q
ON CONFLICT ("templateId", "questionId") DO UPDATE SET
  "sortOrder" = EXCLUDED."sortOrder",
  "required" = EXCLUDED."required",
  "updatedAt" = CURRENT_TIMESTAMP;

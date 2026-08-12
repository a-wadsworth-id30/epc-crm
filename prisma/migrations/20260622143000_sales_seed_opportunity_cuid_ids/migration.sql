UPDATE "SalesOpportunity"
SET "id" = 'cm00000000000000000000001'
WHERE "id" = 'seed-opportunity-acme-implementation'
AND NOT EXISTS (
  SELECT 1 FROM "SalesOpportunity" WHERE "id" = 'cm00000000000000000000001'
);

UPDATE "SalesOpportunity"
SET "id" = 'cm00000000000000000000002'
WHERE "id" = 'seed-opportunity-david-website-enquiry'
AND NOT EXISTS (
  SELECT 1 FROM "SalesOpportunity" WHERE "id" = 'cm00000000000000000000002'
);

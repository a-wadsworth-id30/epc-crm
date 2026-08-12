INSERT INTO "Company" ("id", "name", "status", "createdAt", "updatedAt")
SELECT
  'company_' || md5(lower(trim(c."companyName"))),
  trim(c."companyName"),
  'Prospect',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."companyName" IS NOT NULL
  AND trim(c."companyName") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "Company" existing
    WHERE lower(existing."name") = lower(trim(c."companyName"))
  )
GROUP BY lower(trim(c."companyName")), trim(c."companyName");

UPDATE "Contact" c
SET "companyId" = existing."id"
FROM "Company" existing
WHERE c."companyId" IS NULL
  AND c."companyName" IS NOT NULL
  AND lower(existing."name") = lower(trim(c."companyName"));

-- Add user-backed Company ownership while retaining the legacy text owner for
-- imports and integrations. Only an unambiguous active-user name match is
-- backfilled; unmatched text remains available for review.
ALTER TABLE "Company" ADD COLUMN "ownerUserId" TEXT;

UPDATE "Company" AS company
SET "ownerUserId" = matched."userId"
FROM (
  SELECT LOWER(TRIM("name")) AS "ownerKey", MIN("id") AS "userId"
  FROM "User"
  WHERE "status" = 'ACTIVE'
  GROUP BY LOWER(TRIM("name"))
  HAVING COUNT(*) = 1
) AS matched
WHERE company."owner" IS NOT NULL
  AND LOWER(TRIM(company."owner")) = matched."ownerKey";

CREATE INDEX "Company_ownerUserId_updatedAt_idx"
ON "Company"("ownerUserId", "updatedAt");

ALTER TABLE "Company"
ADD CONSTRAINT "Company_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

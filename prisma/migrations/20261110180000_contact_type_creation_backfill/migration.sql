-- Repair contacts created by legacy/import paths after the original person-type
-- backfill. Future creation paths assign the matching system type directly.
UPDATE "Contact" AS contact
SET "contactTypeId" = contact_type."id"
FROM "ContactType" AS contact_type
WHERE contact."contactTypeId" IS NULL
  AND contact_type."systemKey" = contact."category";

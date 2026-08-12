ALTER TABLE "User"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "avatarUrl" TEXT,
  ADD COLUMN "landline" TEXT,
  ADD COLUMN "mobile" TEXT;

UPDATE "User"
SET
  "firstName" = split_part(trim("name"), ' ', 1),
  "lastName" = nullif(trim(substr(trim("name"), length(split_part(trim("name"), ' ', 1)) + 1)), '')
WHERE "firstName" IS NULL
  AND trim("name") <> '';

CREATE TYPE "ContactCategory" AS ENUM ('CONSUMER', 'TRADE', 'INSTALLER', 'COMPANY');

ALTER TABLE "Contact"
ADD COLUMN "category" "ContactCategory" NOT NULL DEFAULT 'CONSUMER';

UPDATE "Contact" AS contact
SET "category" = 'INSTALLER'
WHERE EXISTS (
  SELECT 1
  FROM "ContactTagAssignment" assignment
  JOIN "ContactTag" tag ON tag."id" = assignment."tagId"
  WHERE assignment."contactId" = contact."id"
    AND tag."name" ~* '(installer|installation|mcs|heat pump|solar)'
)
OR COALESCE(contact."role", '') ~* '(installer|installation|commissioning|engineer)'
OR COALESCE(contact."companyName", '') ~* '(installer|installation|heating|solar|renewables)';

UPDATE "Contact" AS contact
SET "category" = 'COMPANY'
WHERE contact."category" = 'CONSUMER'
  AND (
    EXISTS (
      SELECT 1
      FROM "ContactTagAssignment" assignment
      JOIN "ContactTag" tag ON tag."id" = assignment."tagId"
      WHERE assignment."contactId" = contact."id"
        AND tag."name" ~* '(company|supplier|manufacturer|distributor|partner|organisation|organization)'
    )
    OR COALESCE(contact."role", '') ~* '(supplier|manufacturer|distributor|partner)'
  );

UPDATE "Contact" AS contact
SET "category" = 'TRADE'
WHERE contact."category" = 'CONSUMER'
  AND (
    EXISTS (
      SELECT 1
      FROM "ContactTagAssignment" assignment
      JOIN "ContactTag" tag ON tag."id" = assignment."tagId"
      WHERE assignment."contactId" = contact."id"
        AND tag."name" ~* '(trade|architect|builder|electrician|plumber|consultant|developer|surveyor|contractor)'
    )
    OR COALESCE(contact."role", '') ~* '(architect|builder|electrician|plumber|consultant|developer|surveyor|contractor)'
  );

CREATE INDEX "Contact_category_updatedAt_idx" ON "Contact"("category", "updatedAt");

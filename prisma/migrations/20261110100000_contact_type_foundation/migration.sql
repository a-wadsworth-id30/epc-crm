-- Introduce configurable contact types alongside the existing ContactCategory
-- enum. The legacy enum remains in place during the staged UI migration.
CREATE TABLE "ContactType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pluralName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "systemKey" "ContactCategory",
  "colourKey" TEXT NOT NULL DEFAULT 'gray',
  "iconKey" TEXT NOT NULL DEFAULT 'user',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactType_slug_key" ON "ContactType"("slug");
CREATE UNIQUE INDEX "ContactType_systemKey_key" ON "ContactType"("systemKey");
CREATE INDEX "ContactType_isActive_displayOrder_idx" ON "ContactType"("isActive", "displayOrder");
CREATE INDEX "ContactType_isDefault_isActive_idx" ON "ContactType"("isDefault", "isActive");

INSERT INTO "ContactType" (
  "id",
  "name",
  "pluralName",
  "slug",
  "description",
  "systemKey",
  "colourKey",
  "iconKey",
  "displayOrder",
  "isDefault"
)
VALUES
  (
    'contact-type-consumer',
    'Consumer',
    'Consumers',
    'consumer',
    'Current or potential domestic customers.',
    'CONSUMER',
    'success',
    'user',
    10,
    true
  ),
  (
    'contact-type-trade',
    'Trade',
    'Trade',
    'trade',
    'Industry professionals EPC works with.',
    'TRADE',
    'blue',
    'briefcase',
    20,
    false
  ),
  (
    'contact-type-installer',
    'Installer',
    'Installers',
    'installer',
    'Members of EPC''s installer network.',
    'INSTALLER',
    'purple',
    'wrench',
    30,
    false
  ),
  (
    'contact-type-company',
    'Company',
    'Company contacts',
    'company',
    'Organisations, suppliers or business entities.',
    'COMPANY',
    'orange',
    'building',
    40,
    false
  );

ALTER TABLE "Contact" ADD COLUMN "contactTypeId" TEXT;

UPDATE "Contact"
SET "contactTypeId" = CASE "category"
  WHEN 'CONSUMER' THEN 'contact-type-consumer'
  WHEN 'TRADE' THEN 'contact-type-trade'
  WHEN 'INSTALLER' THEN 'contact-type-installer'
  WHEN 'COMPANY' THEN 'contact-type-company'
END;

CREATE INDEX "Contact_contactTypeId_updatedAt_idx" ON "Contact"("contactTypeId", "updatedAt");

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_contactTypeId_fkey"
  FOREIGN KEY ("contactTypeId") REFERENCES "ContactType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

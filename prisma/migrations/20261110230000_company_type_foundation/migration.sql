-- Company Types classify organisations independently from Person Types and
-- lifecycle status. The existing optional Contact.companyId relationship and
-- cached companyName remain unchanged for integration compatibility.
CREATE TYPE "CompanyTypeSystemKey" AS ENUM (
  'CUSTOMER',
  'INSTALLER_COMPANY',
  'TRADE_PARTNER',
  'SUPPLIER',
  'SUBCONTRACTOR',
  'OTHER'
);

CREATE TABLE "CompanyType" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pluralName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "systemKey" "CompanyTypeSystemKey",
  "colourKey" TEXT NOT NULL DEFAULT 'gray',
  "iconKey" TEXT NOT NULL DEFAULT 'building',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyType_slug_key" ON "CompanyType"("slug");
CREATE UNIQUE INDEX "CompanyType_systemKey_key" ON "CompanyType"("systemKey");
CREATE INDEX "CompanyType_isActive_displayOrder_idx" ON "CompanyType"("isActive", "displayOrder");
CREATE INDEX "CompanyType_isDefault_isActive_idx" ON "CompanyType"("isDefault", "isActive");

INSERT INTO "CompanyType" (
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
    'company-type-customer',
    'Customer',
    'Customers',
    'customer',
    'Organisations that purchase or receive EPC services.',
    'CUSTOMER',
    'success',
    'building',
    10,
    false
  ),
  (
    'company-type-installer-company',
    'Installer Company',
    'Installer Companies',
    'installer-company',
    'Installation businesses working within EPC''s delivery network.',
    'INSTALLER_COMPANY',
    'purple',
    'wrench',
    20,
    false
  ),
  (
    'company-type-trade-partner',
    'Trade Partner',
    'Trade Partners',
    'trade-partner',
    'Trade organisations and professional partners EPC works with.',
    'TRADE_PARTNER',
    'blue',
    'briefcase',
    30,
    false
  ),
  (
    'company-type-supplier',
    'Supplier',
    'Suppliers',
    'supplier',
    'Organisations supplying products, services or materials.',
    'SUPPLIER',
    'orange',
    'package',
    40,
    false
  ),
  (
    'company-type-subcontractor',
    'Subcontractor',
    'Subcontractors',
    'subcontractor',
    'External organisations contracted to deliver work for EPC.',
    'SUBCONTRACTOR',
    'orange',
    'hard-hat',
    50,
    false
  ),
  (
    'company-type-other',
    'Other',
    'Other Companies',
    'other',
    'Companies that have not yet been assigned a more specific type.',
    'OTHER',
    'gray',
    'building',
    60,
    true
  );

ALTER TABLE "Company" ADD COLUMN "companyTypeId" TEXT;

-- Existing records are deliberately classified as Other. Inferring a type
-- from a company name or Prospect lifecycle status would create false data.
UPDATE "Company"
SET "companyTypeId" = 'company-type-other'
WHERE "companyTypeId" IS NULL;

CREATE INDEX "Company_companyTypeId_updatedAt_idx" ON "Company"("companyTypeId", "updatedAt");

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_companyTypeId_fkey"
  FOREIGN KEY ("companyTypeId") REFERENCES "CompanyType"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep the stable COMPANY system key and slug for compatibility, while making
-- the visible label clear that this Person Type represents an individual.
UPDATE "ContactType"
SET
  "name" = 'Company Contact',
  "pluralName" = 'Company Contacts',
  "description" = 'People associated with a company or organisation.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "systemKey" = 'COMPANY';

-- Type-specific company fields mirror the proven Person Type field model.
-- Values are stored separately from core company data so administrators can
-- evolve configuration without changing the Company table for every field.
CREATE TABLE "CompanyTypeField" (
  "id" TEXT NOT NULL,
  "companyTypeId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "fieldType" "ContactCustomFieldType" NOT NULL,
  "requirementMode" "ContactFieldRequirementMode" NOT NULL DEFAULT 'OPTIONAL',
  "options" JSONB,
  "placeholder" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "showInTable" BOOLEAN NOT NULL DEFAULT false,
  "isSearchable" BOOLEAN NOT NULL DEFAULT false,
  "externalEditable" BOOLEAN NOT NULL DEFAULT false,
  "viewRoleTemplates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "editRoleTemplates" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyTypeField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyCustomFieldValue" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "textValue" TEXT,
  "numberValue" DECIMAL(65,30),
  "booleanValue" BOOLEAN,
  "dateValue" TIMESTAMP(3),
  "jsonValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyCustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyTypeField_companyTypeId_key_key"
  ON "CompanyTypeField"("companyTypeId", "key");
CREATE INDEX "CompanyTypeField_companyTypeId_isActive_displayOrder_idx"
  ON "CompanyTypeField"("companyTypeId", "isActive", "displayOrder");
CREATE UNIQUE INDEX "CompanyCustomFieldValue_companyId_fieldId_key"
  ON "CompanyCustomFieldValue"("companyId", "fieldId");
CREATE INDEX "CompanyCustomFieldValue_fieldId_textValue_idx"
  ON "CompanyCustomFieldValue"("fieldId", "textValue");
CREATE INDEX "CompanyCustomFieldValue_fieldId_numberValue_idx"
  ON "CompanyCustomFieldValue"("fieldId", "numberValue");
CREATE INDEX "CompanyCustomFieldValue_fieldId_dateValue_idx"
  ON "CompanyCustomFieldValue"("fieldId", "dateValue");

ALTER TABLE "CompanyTypeField"
  ADD CONSTRAINT "CompanyTypeField_companyTypeId_fkey"
  FOREIGN KEY ("companyTypeId") REFERENCES "CompanyType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyCustomFieldValue"
  ADD CONSTRAINT "CompanyCustomFieldValue_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyCustomFieldValue"
  ADD CONSTRAINT "CompanyCustomFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "CompanyTypeField"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

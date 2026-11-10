CREATE TYPE "ContactCustomFieldType" AS ENUM (
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'BOOLEAN',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'EMAIL',
  'PHONE',
  'URL',
  'ADDRESS'
);

CREATE TYPE "ContactFieldRequirementMode" AS ENUM (
  'OPTIONAL',
  'COMPLETENESS',
  'REQUIRED'
);

CREATE TABLE "ContactTypeField" (
  "id" TEXT NOT NULL,
  "contactTypeId" TEXT NOT NULL,
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
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactTypeField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactCustomFieldValue" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "textValue" TEXT,
  "numberValue" DECIMAL(65,30),
  "booleanValue" BOOLEAN,
  "dateValue" TIMESTAMP(3),
  "jsonValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactCustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactTypeField_contactTypeId_key_key"
  ON "ContactTypeField"("contactTypeId", "key");
CREATE INDEX "ContactTypeField_contactTypeId_isActive_displayOrder_idx"
  ON "ContactTypeField"("contactTypeId", "isActive", "displayOrder");
CREATE UNIQUE INDEX "ContactCustomFieldValue_contactId_fieldId_key"
  ON "ContactCustomFieldValue"("contactId", "fieldId");
CREATE INDEX "ContactCustomFieldValue_fieldId_textValue_idx"
  ON "ContactCustomFieldValue"("fieldId", "textValue");
CREATE INDEX "ContactCustomFieldValue_fieldId_numberValue_idx"
  ON "ContactCustomFieldValue"("fieldId", "numberValue");
CREATE INDEX "ContactCustomFieldValue_fieldId_dateValue_idx"
  ON "ContactCustomFieldValue"("fieldId", "dateValue");

ALTER TABLE "ContactTypeField"
  ADD CONSTRAINT "ContactTypeField_contactTypeId_fkey"
  FOREIGN KEY ("contactTypeId") REFERENCES "ContactType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactCustomFieldValue"
  ADD CONSTRAINT "ContactCustomFieldValue_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactCustomFieldValue"
  ADD CONSTRAINT "ContactCustomFieldValue_fieldId_fkey"
  FOREIGN KEY ("fieldId") REFERENCES "ContactTypeField"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyTypeDocumentRequirement" (
  "id" TEXT NOT NULL,
  "companyTypeId" TEXT NOT NULL,
  "uploadType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompanyTypeDocumentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyTypeDocumentRequirement_companyTypeId_uploadType_key"
  ON "CompanyTypeDocumentRequirement"("companyTypeId", "uploadType");
CREATE INDEX "CompanyTypeDocumentRequirement_companyTypeId_isActive_displayOrder_idx"
  ON "CompanyTypeDocumentRequirement"("companyTypeId", "isActive", "displayOrder");

ALTER TABLE "CompanyTypeDocumentRequirement"
  ADD CONSTRAINT "CompanyTypeDocumentRequirement_companyTypeId_fkey"
  FOREIGN KEY ("companyTypeId") REFERENCES "CompanyType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ContactTypeDocumentRequirement" (
  "id" TEXT NOT NULL,
  "contactTypeId" TEXT NOT NULL,
  "uploadType" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContactTypeDocumentRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactTypeDocumentRequirement_contactTypeId_uploadType_key"
  ON "ContactTypeDocumentRequirement"("contactTypeId", "uploadType");
CREATE INDEX "ContactTypeDocumentRequirement_contactTypeId_isActive_displayOrder_idx"
  ON "ContactTypeDocumentRequirement"("contactTypeId", "isActive", "displayOrder");

ALTER TABLE "ContactTypeDocumentRequirement"
  ADD CONSTRAINT "ContactTypeDocumentRequirement_contactTypeId_fkey"
  FOREIGN KEY ("contactTypeId") REFERENCES "ContactType"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

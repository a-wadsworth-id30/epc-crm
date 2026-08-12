-- Track the user who created standalone CRM people and organisations so
-- non-admin creators can still view records before a sale/opportunity exists.
ALTER TABLE "Company" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "createdByUserId" TEXT;

CREATE INDEX "Company_createdByUserId_updatedAt_idx" ON "Company"("createdByUserId", "updatedAt");
CREATE INDEX "Contact_createdByUserId_updatedAt_idx" ON "Contact"("createdByUserId", "updatedAt");

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

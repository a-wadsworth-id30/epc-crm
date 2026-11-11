-- Add an optional self-referencing Company hierarchy. Existing Companies stay
-- independent until a user explicitly assigns a parent.
ALTER TABLE "Company" ADD COLUMN "parentCompanyId" TEXT;

ALTER TABLE "Company"
ADD CONSTRAINT "Company_parentCompanyId_not_self"
CHECK ("parentCompanyId" IS NULL OR "parentCompanyId" <> "id");

CREATE INDEX "Company_parentCompanyId_name_idx"
ON "Company"("parentCompanyId", "name");

ALTER TABLE "Company"
ADD CONSTRAINT "Company_parentCompanyId_fkey"
FOREIGN KEY ("parentCompanyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

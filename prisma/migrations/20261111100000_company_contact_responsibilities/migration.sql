CREATE TYPE "CompanyContactResponsibility" AS ENUM (
  'PRIMARY',
  'COMMERCIAL',
  'TECHNICAL',
  'ACCOUNTS',
  'COMPLIANCE'
);

ALTER TABLE "Contact"
ADD COLUMN "companyContactResponsibilities" "CompanyContactResponsibility"[] NOT NULL DEFAULT ARRAY[]::"CompanyContactResponsibility"[];

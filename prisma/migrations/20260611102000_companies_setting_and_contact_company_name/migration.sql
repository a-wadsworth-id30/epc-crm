ALTER TABLE "Contact" ADD COLUMN "companyName" TEXT;

UPDATE "Contact"
SET "companyName" = "Company"."name"
FROM "Company"
WHERE "Contact"."companyId" = "Company"."id";

CREATE TABLE "CrmSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "companiesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CrmSettings" ("id", "companiesEnabled", "createdAt", "updatedAt")
VALUES ('default', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

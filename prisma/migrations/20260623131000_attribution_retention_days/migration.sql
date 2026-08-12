-- AlterTable
ALTER TABLE "CrmSettings"
ADD COLUMN "attributionRetentionDays" INTEGER NOT NULL DEFAULT 365;

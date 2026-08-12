-- AlterTable
ALTER TABLE "AttributionDomain"
ADD COLUMN "trackingEnabled" BOOLEAN,
ADD COLUMN "consentRequired" BOOLEAN,
ADD COLUMN "formTrackingEnabled" BOOLEAN,
ADD COLUMN "phoneTrackingEnabled" BOOLEAN,
ADD COLUMN "visibleNumberReplacementEnabled" BOOLEAN;

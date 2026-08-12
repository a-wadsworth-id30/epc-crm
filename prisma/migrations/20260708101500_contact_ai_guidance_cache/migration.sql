ALTER TABLE "Contact"
ADD COLUMN "aiGuidance" JSONB,
ADD COLUMN "aiGuidanceFingerprint" TEXT,
ADD COLUMN "aiGuidanceGeneratedAt" TIMESTAMP(3);

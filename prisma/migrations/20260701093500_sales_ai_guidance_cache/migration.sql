ALTER TABLE "SalesOpportunity" ADD COLUMN "aiGuidance" JSONB,
ADD COLUMN "aiGuidanceFingerprint" TEXT,
ADD COLUMN "aiGuidanceGeneratedAt" TIMESTAMP(3);

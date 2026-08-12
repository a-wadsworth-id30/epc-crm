CREATE TABLE "AttributionDniRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "matchField" TEXT NOT NULL,
  "matchOperator" TEXT NOT NULL DEFAULT 'contains',
  "matchValue" TEXT,
  "poolLabel" TEXT,
  "fallbackNumber" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AttributionDniRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AttributionDniRule_isActive_priority_idx" ON "AttributionDniRule"("isActive", "priority");
CREATE INDEX "AttributionDniRule_isDefault_idx" ON "AttributionDniRule"("isDefault");
CREATE INDEX "AttributionDniRule_matchField_idx" ON "AttributionDniRule"("matchField");
CREATE INDEX "AttributionDniRule_poolLabel_idx" ON "AttributionDniRule"("poolLabel");

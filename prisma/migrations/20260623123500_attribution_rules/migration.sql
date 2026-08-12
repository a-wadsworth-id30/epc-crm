-- CreateTable
CREATE TABLE "AttributionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL DEFAULT 'source-override',
    "matchField" TEXT NOT NULL,
    "matchOperator" TEXT NOT NULL DEFAULT 'contains',
    "matchValue" TEXT NOT NULL,
    "outputSource" TEXT,
    "outputChannel" TEXT,
    "outputCampaign" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributionRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributionRule_isActive_priority_idx" ON "AttributionRule"("isActive", "priority");

-- CreateIndex
CREATE INDEX "AttributionRule_ruleType_idx" ON "AttributionRule"("ruleType");

-- CreateIndex
CREATE INDEX "AttributionRule_matchField_idx" ON "AttributionRule"("matchField");

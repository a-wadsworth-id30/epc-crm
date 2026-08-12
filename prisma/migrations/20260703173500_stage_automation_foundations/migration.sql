CREATE TYPE "SalesAutomationTriggerType" AS ENUM (
  'STAGE_ENTERED',
  'EMAIL_RECEIVED',
  'EMAIL_SENT',
  'SMS_RECEIVED',
  'SMS_SENT',
  'CALL_COMPLETED',
  'CALL_MISSED',
  'SITE_VISIT'
);

CREATE TYPE "SalesAutomationActionType" AS ENUM (
  'CREATE_TASK',
  'SEND_EMAIL',
  'SEND_SMS',
  'NOTIFY_OWNER',
  'UPDATE_SCORE',
  'SUGGEST_STAGE_MOVE'
);

CREATE TYPE "SalesAutomationRunStatus" AS ENUM (
  'COMPLETED',
  'SKIPPED',
  'FAILED'
);

ALTER TABLE "SalesOpportunity"
ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "scoreUpdatedAt" TIMESTAMP(3);

CREATE TABLE "LeadScoreEvent" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "delta" INTEGER NOT NULL,
  "scoreAfter" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeadScoreEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesAutomationRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "trigger" "SalesAutomationTriggerType" NOT NULL,
  "action" "SalesAutomationActionType" NOT NULL,
  "salesPipelineStageId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesAutomationRun" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT,
  "opportunityId" TEXT,
  "trigger" "SalesAutomationTriggerType" NOT NULL,
  "action" "SalesAutomationActionType" NOT NULL,
  "status" "SalesAutomationRunStatus" NOT NULL,
  "salesPipelineStageId" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SalesAutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesOpportunity_score_idx" ON "SalesOpportunity"("score");
CREATE INDEX "LeadScoreEvent_opportunityId_createdAt_idx" ON "LeadScoreEvent"("opportunityId", "createdAt");
CREATE INDEX "LeadScoreEvent_source_createdAt_idx" ON "LeadScoreEvent"("source", "createdAt");
CREATE INDEX "SalesAutomationRule_trigger_isActive_idx" ON "SalesAutomationRule"("trigger", "isActive");
CREATE INDEX "SalesAutomationRule_salesPipelineStageId_trigger_idx" ON "SalesAutomationRule"("salesPipelineStageId", "trigger");
CREATE INDEX "SalesAutomationRun_opportunityId_createdAt_idx" ON "SalesAutomationRun"("opportunityId", "createdAt");
CREATE INDEX "SalesAutomationRun_ruleId_createdAt_idx" ON "SalesAutomationRun"("ruleId", "createdAt");
CREATE INDEX "SalesAutomationRun_trigger_status_createdAt_idx" ON "SalesAutomationRun"("trigger", "status", "createdAt");

ALTER TABLE "LeadScoreEvent"
ADD CONSTRAINT "LeadScoreEvent_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesAutomationRule"
ADD CONSTRAINT "SalesAutomationRule_salesPipelineStageId_fkey"
FOREIGN KEY ("salesPipelineStageId") REFERENCES "SalesPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesAutomationRun"
ADD CONSTRAINT "SalesAutomationRun_ruleId_fkey"
FOREIGN KEY ("ruleId") REFERENCES "SalesAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SalesAutomationRun"
ADD CONSTRAINT "SalesAutomationRun_opportunityId_fkey"
FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

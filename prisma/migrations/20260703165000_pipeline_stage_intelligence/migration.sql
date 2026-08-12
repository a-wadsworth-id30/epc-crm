CREATE TYPE "StageMovementPolicy" AS ENUM ('MANUAL', 'AI_SUGGESTED', 'RULE_AUTOMATED', 'AI_AUTOMATED');

CREATE TYPE "StageGateMode" AS ENUM ('NONE', 'WARN', 'BLOCK');

ALTER TABLE "SalesPipelineStage"
ADD COLUMN "goal" TEXT,
ADD COLUMN "aiContext" TEXT,
ADD COLUMN "movementPolicy" "StageMovementPolicy" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "gateMode" "StageGateMode" NOT NULL DEFAULT 'WARN';

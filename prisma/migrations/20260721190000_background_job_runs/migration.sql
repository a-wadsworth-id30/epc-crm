CREATE TYPE "BackgroundJobRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'WARNING', 'ERROR');

CREATE TABLE "BackgroundJobRun" (
  "id" TEXT NOT NULL,
  "jobType" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "status" "BackgroundJobRunStatus" NOT NULL DEFAULT 'RUNNING',
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "actorId" TEXT,
  "recordsRead" INTEGER NOT NULL DEFAULT 0,
  "recordsWritten" INTEGER NOT NULL DEFAULT 0,
  "message" TEXT,
  "errorMessage" TEXT,
  "summary" JSONB,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BackgroundJobRun_status_startedAt_idx" ON "BackgroundJobRun"("status", "startedAt");
CREATE INDEX "BackgroundJobRun_jobType_startedAt_idx" ON "BackgroundJobRun"("jobType", "startedAt");
CREATE INDEX "BackgroundJobRun_jobName_startedAt_idx" ON "BackgroundJobRun"("jobName", "startedAt");
CREATE INDEX "BackgroundJobRun_actorId_startedAt_idx" ON "BackgroundJobRun"("actorId", "startedAt");
CREATE INDEX "BackgroundJobRun_createdAt_idx" ON "BackgroundJobRun"("createdAt");

ALTER TABLE "BackgroundJobRun"
  ADD CONSTRAINT "BackgroundJobRun_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

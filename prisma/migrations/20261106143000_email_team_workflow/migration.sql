CREATE TYPE "EmailTeamStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED');

ALTER TABLE "EmailMessage"
ADD COLUMN "teamStatus" "EmailTeamStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN "assignedUserId" TEXT,
ADD COLUMN "assignedAt" TIMESTAMP(3);

CREATE INDEX "EmailMessage_teamStatus_receivedAt_idx"
ON "EmailMessage"("teamStatus", "receivedAt");

CREATE INDEX "EmailMessage_assignedUserId_teamStatus_idx"
ON "EmailMessage"("assignedUserId", "teamStatus");

ALTER TABLE "EmailMessage"
ADD CONSTRAINT "EmailMessage_assignedUserId_fkey"
FOREIGN KEY ("assignedUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ContactSegmentAudience" AS ENUM ('PEOPLE', 'COMPANIES');

-- CreateTable
CREATE TABLE "ContactSegment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" "ContactSegmentAudience" NOT NULL DEFAULT 'PEOPLE',
    "prompt" TEXT,
    "criteria" JSONB NOT NULL,
    "aiSummary" TEXT,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContactSegment_audience_updatedAt_idx" ON "ContactSegment"("audience", "updatedAt");

-- CreateIndex
CREATE INDEX "ContactSegment_createdByUserId_updatedAt_idx" ON "ContactSegment"("createdByUserId", "updatedAt");

-- AddForeignKey
ALTER TABLE "ContactSegment" ADD CONSTRAINT "ContactSegment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

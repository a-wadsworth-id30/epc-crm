-- CreateTable
CREATE TABLE "RealtimeVersion" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RealtimeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RealtimeVersion_topic_key" ON "RealtimeVersion"("topic");

-- CreateIndex
CREATE INDEX "RealtimeVersion_updatedAt_idx" ON "RealtimeVersion"("updatedAt");

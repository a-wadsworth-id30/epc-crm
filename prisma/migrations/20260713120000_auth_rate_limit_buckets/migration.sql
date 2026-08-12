CREATE TABLE "AuthRateLimitBucket" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "blockedUntil" TIMESTAMP(3),
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AuthRateLimitBucket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthRateLimitBucket_key_key" ON "AuthRateLimitBucket"("key");
CREATE INDEX "AuthRateLimitBucket_blockedUntil_idx" ON "AuthRateLimitBucket"("blockedUntil");
CREATE INDEX "AuthRateLimitBucket_updatedAt_idx" ON "AuthRateLimitBucket"("updatedAt");

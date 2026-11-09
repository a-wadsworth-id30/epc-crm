ALTER TABLE "EmailMailbox"
ADD COLUMN "gmailWatchExpiresAt" TIMESTAMP(3),
ADD COLUMN "gmailWatchFailureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "gmailWatchLastError" TEXT,
ADD COLUMN "gmailWatchRenewedAt" TIMESTAMP(3),
ADD COLUMN "gmailWatchRetryAt" TIMESTAMP(3);

CREATE INDEX "EmailMailbox_status_syncEnabled_gmailWatchExpiresAt_idx"
ON "EmailMailbox"("status", "syncEnabled", "gmailWatchExpiresAt");

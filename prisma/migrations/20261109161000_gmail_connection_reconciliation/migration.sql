ALTER TABLE "EmailMailbox"
ADD COLUMN "authStatusCheckedAt" TIMESTAMP(3),
ADD COLUMN "authStatusLastError" TEXT;

CREATE INDEX "EmailMailbox_authStatusCheckedAt_idx"
ON "EmailMailbox"("authStatusCheckedAt");

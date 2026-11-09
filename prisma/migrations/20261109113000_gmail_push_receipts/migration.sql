CREATE TYPE "GmailPushReceiptStatus" AS ENUM ('PENDING', 'PROCESSED', 'IGNORED');

CREATE TABLE "GmailPushReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "historyId" TEXT NOT NULL,
    "status" "GmailPushReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "publishedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GmailPushReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GmailPushReceipt_messageId_key"
ON "GmailPushReceipt"("messageId");

CREATE INDEX "GmailPushReceipt_mailboxId_status_receivedAt_idx"
ON "GmailPushReceipt"("mailboxId", "status", "receivedAt");

CREATE INDEX "GmailPushReceipt_status_receivedAt_idx"
ON "GmailPushReceipt"("status", "receivedAt");

ALTER TABLE "GmailPushReceipt"
ADD CONSTRAINT "GmailPushReceipt_mailboxId_fkey"
FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

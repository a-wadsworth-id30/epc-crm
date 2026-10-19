-- CreateEnum
CREATE TYPE "EmailMailboxStatus" AS ENUM ('CONNECTED', 'NEEDS_REAUTH', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "EmailMailboxPurpose" AS ENUM ('PERSONAL', 'SALES', 'ACCOUNTS', 'SHARED');

-- CreateTable
CREATE TABLE "EmailMailbox" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gmail',
    "authConnectionId" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "purpose" "EmailMailboxPurpose" NOT NULL DEFAULT 'SHARED',
    "status" "EmailMailboxStatus" NOT NULL DEFAULT 'CONNECTED',
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sendEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ownerUserId" TEXT,
    "lastHistoryId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastFullSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMailboxAccess" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canSend" BOOLEAN NOT NULL DEFAULT true,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMailboxAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThreadLink" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "providerThreadId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "contactId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'automatic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailThreadLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "providerAttachmentId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "fileAssetId" TEXT,
    "archiveStatus" TEXT NOT NULL DEFAULT 'REFERENCE',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EmailMessage"
ADD COLUMN "mailboxId" TEXT,
ADD COLUMN "providerThreadId" TEXT,
ADD COLUMN "internetMessageId" TEXT,
ADD COLUMN "inReplyTo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EmailMailbox_authConnectionId_key" ON "EmailMailbox"("authConnectionId");
CREATE UNIQUE INDEX "EmailMailbox_provider_emailAddress_key" ON "EmailMailbox"("provider", "emailAddress");
CREATE INDEX "EmailMailbox_status_syncEnabled_idx" ON "EmailMailbox"("status", "syncEnabled");
CREATE INDEX "EmailMailbox_ownerUserId_idx" ON "EmailMailbox"("ownerUserId");
CREATE INDEX "EmailMailbox_purpose_idx" ON "EmailMailbox"("purpose");
CREATE UNIQUE INDEX "EmailMailboxAccess_mailboxId_userId_key" ON "EmailMailboxAccess"("mailboxId", "userId");
CREATE INDEX "EmailMailboxAccess_userId_idx" ON "EmailMailboxAccess"("userId");
CREATE UNIQUE INDEX "EmailThreadLink_mailboxId_providerThreadId_key" ON "EmailThreadLink"("mailboxId", "providerThreadId");
CREATE INDEX "EmailThreadLink_opportunityId_idx" ON "EmailThreadLink"("opportunityId");
CREATE INDEX "EmailThreadLink_contactId_idx" ON "EmailThreadLink"("contactId");
CREATE UNIQUE INDEX "EmailAttachment_emailMessageId_providerAttachmentId_key" ON "EmailAttachment"("emailMessageId", "providerAttachmentId");
CREATE INDEX "EmailAttachment_fileAssetId_idx" ON "EmailAttachment"("fileAssetId");
CREATE INDEX "EmailAttachment_archiveStatus_createdAt_idx" ON "EmailAttachment"("archiveStatus", "createdAt");
CREATE INDEX "EmailMessage_mailboxId_receivedAt_idx" ON "EmailMessage"("mailboxId", "receivedAt");
CREATE INDEX "EmailMessage_mailboxId_providerThreadId_idx" ON "EmailMessage"("mailboxId", "providerThreadId");
CREATE INDEX "EmailMessage_internetMessageId_idx" ON "EmailMessage"("internetMessageId");

-- AddForeignKey
ALTER TABLE "EmailMailbox" ADD CONSTRAINT "EmailMailbox_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMailboxAccess" ADD CONSTRAINT "EmailMailboxAccess_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMailboxAccess" ADD CONSTRAINT "EmailMailboxAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThreadLink" ADD CONSTRAINT "EmailThreadLink_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThreadLink" ADD CONSTRAINT "EmailThreadLink_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailThreadLink" ADD CONSTRAINT "EmailThreadLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "EmailMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

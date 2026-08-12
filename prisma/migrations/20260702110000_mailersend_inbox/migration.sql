-- CreateEnum
CREATE TYPE "EmailMessageStatus" AS ENUM ('UNREAD', 'READ', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mailersend',
    "providerMessageId" TEXT,
    "inboundRouteId" TEXT,
    "status" "EmailMessageStatus" NOT NULL DEFAULT 'UNREAD',
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'INBOUND',
    "fromName" TEXT,
    "fromAddress" TEXT,
    "toAddress" TEXT,
    "ccAddresses" JSONB,
    "subject" TEXT,
    "summary" TEXT NOT NULL,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "rawMessage" TEXT,
    "attachments" JSONB,
    "headers" JSONB,
    "metadata" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "contactId" TEXT,
    "opportunityId" TEXT,
    "salesCommunicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_providerMessageId_key" ON "EmailMessage"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_salesCommunicationId_key" ON "EmailMessage"("salesCommunicationId");

-- CreateIndex
CREATE INDEX "EmailMessage_status_receivedAt_idx" ON "EmailMessage"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_fromAddress_idx" ON "EmailMessage"("fromAddress");

-- CreateIndex
CREATE INDEX "EmailMessage_contactId_receivedAt_idx" ON "EmailMessage"("contactId", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_opportunityId_receivedAt_idx" ON "EmailMessage"("opportunityId", "receivedAt");

-- CreateIndex
CREATE INDEX "EmailMessage_inboundRouteId_idx" ON "EmailMessage"("inboundRouteId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_salesCommunicationId_fkey" FOREIGN KEY ("salesCommunicationId") REFERENCES "SalesCommunication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

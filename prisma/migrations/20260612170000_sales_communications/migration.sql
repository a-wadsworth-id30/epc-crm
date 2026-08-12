CREATE TYPE "CommunicationChannel" AS ENUM ('PHONE', 'EMAIL', 'SMS', 'WHATSAPP', 'NOTE', 'SYSTEM');

CREATE TYPE "CommunicationDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

CREATE TABLE "SalesCommunication" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "channel" "CommunicationChannel" NOT NULL,
  "direction" "CommunicationDirection" NOT NULL,
  "subject" TEXT,
  "summary" TEXT NOT NULL,
  "body" TEXT,
  "fromAddress" TEXT,
  "toAddress" TEXT,
  "externalId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "contactId" TEXT,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SalesCommunication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalesCommunication_opportunityId_occurredAt_idx" ON "SalesCommunication"("opportunityId", "occurredAt");
CREATE INDEX "SalesCommunication_channel_idx" ON "SalesCommunication"("channel");
CREATE INDEX "SalesCommunication_contactId_idx" ON "SalesCommunication"("contactId");
CREATE INDEX "SalesCommunication_userId_idx" ON "SalesCommunication"("userId");

ALTER TABLE "SalesCommunication" ADD CONSTRAINT "SalesCommunication_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SalesOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesCommunication" ADD CONSTRAINT "SalesCommunication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesCommunication" ADD CONSTRAINT "SalesCommunication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "ContactEmailAddress" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactEmailAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactPhoneNumber" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactPhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactEmailAddress_contactId_email_key" ON "ContactEmailAddress"("contactId", "email");

-- CreateIndex
CREATE INDEX "ContactEmailAddress_contactId_idx" ON "ContactEmailAddress"("contactId");

-- CreateIndex
CREATE INDEX "ContactEmailAddress_email_idx" ON "ContactEmailAddress"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ContactPhoneNumber_contactId_phone_key" ON "ContactPhoneNumber"("contactId", "phone");

-- CreateIndex
CREATE INDEX "ContactPhoneNumber_contactId_idx" ON "ContactPhoneNumber"("contactId");

-- CreateIndex
CREATE INDEX "ContactPhoneNumber_phoneNormalized_idx" ON "ContactPhoneNumber"("phoneNormalized");

-- AddForeignKey
ALTER TABLE "ContactEmailAddress" ADD CONSTRAINT "ContactEmailAddress_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactPhoneNumber" ADD CONSTRAINT "ContactPhoneNumber_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

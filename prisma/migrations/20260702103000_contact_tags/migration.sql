CREATE TABLE "ContactTag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactTagAssignment" (
  "contactId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactTagAssignment_pkey" PRIMARY KEY ("contactId", "tagId")
);

CREATE UNIQUE INDEX "ContactTag_slug_key" ON "ContactTag"("slug");
CREATE INDEX "ContactTagAssignment_tagId_idx" ON "ContactTagAssignment"("tagId");

ALTER TABLE "ContactTagAssignment"
  ADD CONSTRAINT "ContactTagAssignment_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContactTagAssignment"
  ADD CONSTRAINT "ContactTagAssignment_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "ContactTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

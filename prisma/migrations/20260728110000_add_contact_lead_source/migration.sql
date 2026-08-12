-- Add a nullable source field for manually created contact records. Existing
-- contacts remain valid, while the CRM UI requires this value for new manual
-- contacts.
ALTER TABLE "Contact" ADD COLUMN "leadSource" TEXT;

CREATE INDEX "Contact_leadSource_createdAt_idx" ON "Contact"("leadSource", "createdAt");

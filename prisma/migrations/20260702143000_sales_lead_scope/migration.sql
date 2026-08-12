-- Add editable lead-scope context for sales opportunities.
ALTER TABLE "SalesOpportunity"
ADD COLUMN "leadScope" JSONB;

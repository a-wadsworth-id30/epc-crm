-- Add a first-class many-to-many Person/Company relationship while retaining
-- Contact.companyId as the primary compatibility link used by integrations.
CREATE TABLE "CompanyContactAffiliation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "responsibilities" "CompanyContactResponsibility"[] NOT NULL DEFAULT ARRAY[]::"CompanyContactResponsibility"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContactAffiliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyContactAffiliation_companyId_contactId_key"
ON "CompanyContactAffiliation"("companyId", "contactId");

CREATE INDEX "CompanyContactAffiliation_companyId_updatedAt_idx"
ON "CompanyContactAffiliation"("companyId", "updatedAt");

CREATE INDEX "CompanyContactAffiliation_contactId_isPrimary_idx"
ON "CompanyContactAffiliation"("contactId", "isPrimary");

-- PostgreSQL partial uniqueness keeps the compatibility primary deterministic
-- without preventing a Person from having any number of additional links.
CREATE UNIQUE INDEX "CompanyContactAffiliation_one_primary_per_contact"
ON "CompanyContactAffiliation"("contactId")
WHERE "isPrimary" = true;

ALTER TABLE "CompanyContactAffiliation"
ADD CONSTRAINT "CompanyContactAffiliation_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CompanyContactAffiliation"
ADD CONSTRAINT "CompanyContactAffiliation_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill every existing primary Company relationship without inferring any
-- additional affiliations. Existing controlled roles belong to that link.
INSERT INTO "CompanyContactAffiliation" (
    "id",
    "companyId",
    "contactId",
    "isPrimary",
    "responsibilities",
    "createdAt",
    "updatedAt"
)
SELECT
    'cca_' || md5("companyId" || ':' || "id"),
    "companyId",
    "id",
    true,
    "companyContactResponsibilities",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "Contact"
WHERE "companyId" IS NOT NULL
ON CONFLICT ("companyId", "contactId") DO NOTHING;

-- When the primary compatibility link changes, copy the selected target
-- affiliation's roles back to Contact. This prevents roles from one Company
-- being carried to another Company by integration updates.
CREATE OR REPLACE FUNCTION sync_contact_primary_affiliation_before()
RETURNS TRIGGER AS $$
DECLARE
    target_responsibilities "CompanyContactResponsibility"[];
BEGIN
    IF TG_OP = 'UPDATE' AND NEW."companyId" IS DISTINCT FROM OLD."companyId" THEN
        IF NEW."companyId" IS NULL THEN
            NEW."companyContactResponsibilities" := ARRAY[]::"CompanyContactResponsibility"[];
        ELSE
            SELECT "responsibilities"
            INTO target_responsibilities
            FROM "CompanyContactAffiliation"
            WHERE "contactId" = NEW."id"
              AND "companyId" = NEW."companyId";

            NEW."companyContactResponsibilities" := COALESCE(
                target_responsibilities,
                ARRAY[]::"CompanyContactResponsibility"[]
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contact_primary_affiliation_before"
BEFORE INSERT OR UPDATE OF "companyId", "companyContactResponsibilities"
ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION sync_contact_primary_affiliation_before();

-- Keep the affiliation table synchronised for every writer, including website,
-- telephony and provider imports that continue to use Contact.companyId.
CREATE OR REPLACE FUNCTION sync_contact_primary_affiliation_after()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW."companyId" IS NULL
       AND OLD."companyId" IS NOT NULL THEN
        DELETE FROM "CompanyContactAffiliation"
        WHERE "contactId" = NEW."id"
          AND "companyId" = OLD."companyId";
    END IF;

    IF NEW."companyId" IS NOT NULL THEN
        UPDATE "CompanyContactAffiliation"
        SET "isPrimary" = false,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "contactId" = NEW."id"
          AND "companyId" <> NEW."companyId"
          AND "isPrimary" = true;

        INSERT INTO "CompanyContactAffiliation" (
            "id",
            "companyId",
            "contactId",
            "isPrimary",
            "responsibilities",
            "createdAt",
            "updatedAt"
        ) VALUES (
            'cca_' || md5(NEW."companyId" || ':' || NEW."id"),
            NEW."companyId",
            NEW."id",
            true,
            NEW."companyContactResponsibilities",
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        )
        ON CONFLICT ("companyId", "contactId") DO UPDATE SET
            "isPrimary" = true,
            "responsibilities" = EXCLUDED."responsibilities",
            "updatedAt" = CURRENT_TIMESTAMP;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Contact_primary_affiliation_after"
AFTER INSERT OR UPDATE OF "companyId", "companyContactResponsibilities"
ON "Contact"
FOR EACH ROW
EXECUTE FUNCTION sync_contact_primary_affiliation_after();

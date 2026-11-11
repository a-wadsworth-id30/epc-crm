import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  companyAffiliationLinkDecision,
  companyAffiliationUnlinkDecision,
} from "../src/lib/companies/contact-relationships";
import {
  mergedCompanyContactResponsibilities,
  normalizeCompanyContactResponsibilities,
} from "../src/lib/companies/contact-responsibilities";

const affiliationMigration = readFileSync(
  "prisma/migrations/20261111113000_company_contact_affiliations/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");

test("a Person with a primary Company gains an additional affiliation", () => {
  assert.deepEqual(
    companyAffiliationLinkDecision({
      currentPrimaryCompanyId: "company-a",
      existingCompanyIds: ["company-a"],
      targetCompanyId: "company-b",
    }),
    { ok: true, action: "linked_additional" },
  );
});

test("the first Company affiliation becomes primary", () => {
  assert.deepEqual(
    companyAffiliationLinkDecision({
      currentPrimaryCompanyId: null,
      existingCompanyIds: [],
      targetCompanyId: "company-a",
    }),
    { ok: true, action: "linked_primary" },
  );
});

test("an existing Company affiliation is idempotent", () => {
  assert.deepEqual(
    companyAffiliationLinkDecision({
      currentPrimaryCompanyId: "company-a",
      existingCompanyIds: ["company-a", "company-b"],
      targetCompanyId: "company-b",
    }),
    { ok: true, action: "unchanged" },
  );
});

test("a primary affiliation cannot be removed while additional links exist", () => {
  const decision = companyAffiliationUnlinkDecision({
    affiliationIsPrimary: true,
    additionalAffiliationCount: 1,
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /another Company primary/);
});

test("additional and sole-primary affiliations can be removed", () => {
  assert.deepEqual(
    companyAffiliationUnlinkDecision({
      affiliationIsPrimary: false,
      additionalAffiliationCount: 1,
    }),
    { ok: true, action: "unlinked_additional" },
  );
  assert.deepEqual(
    companyAffiliationUnlinkDecision({
      affiliationIsPrimary: true,
      additionalAffiliationCount: 0,
    }),
    { ok: true, action: "unlinked_primary" },
  );
});

test("the affiliation schema retains the primary compatibility link", () => {
  assert.match(schema, /model CompanyContactAffiliation/);
  assert.match(schema, /companyAffiliations\s+CompanyContactAffiliation\[\]/);
  assert.match(schema, /companyId\s+String\?/);
});

test("the affiliation migration backfills safely and enforces one primary", () => {
  assert.match(affiliationMigration, /WHERE "companyId" IS NOT NULL/);
  assert.match(affiliationMigration, /one_primary_per_contact/);
  assert.match(affiliationMigration, /WHERE "isPrimary" = true/);
  assert.match(affiliationMigration, /sync_contact_primary_affiliation_after/);
  assert.doesNotMatch(
    affiliationMigration,
    /DROP TABLE|TRUNCATE|DELETE FROM "Contact"/,
  );
});

test("Company contact responsibilities are normalised into a stable order", () => {
  assert.deepEqual(
    normalizeCompanyContactResponsibilities([
      "ACCOUNTS",
      "PRIMARY",
      "ACCOUNTS",
    ]),
    ["PRIMARY", "ACCOUNTS"],
  );
});

test("merging people keeps responsibilities only for the resulting Company", () => {
  assert.deepEqual(
    mergedCompanyContactResponsibilities({
      duplicateCompanyId: "company-a",
      duplicateResponsibilities: ["TECHNICAL"],
      primaryCompanyId: "company-a",
      primaryResponsibilities: ["PRIMARY"],
      resultingCompanyId: "company-a",
    }),
    ["PRIMARY", "TECHNICAL"],
  );

  assert.deepEqual(
    mergedCompanyContactResponsibilities({
      duplicateCompanyId: "company-b",
      duplicateResponsibilities: ["ACCOUNTS"],
      primaryCompanyId: "company-a",
      primaryResponsibilities: ["PRIMARY"],
      resultingCompanyId: "company-a",
    }),
    ["PRIMARY"],
  );
});

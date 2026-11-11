import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  saleParticipantRoleChangeDecision,
  salesParticipantRoleLabel,
  salesParticipantRoleOptions,
} from "../src/lib/sales/participants";

const migration = readFileSync(
  "prisma/migrations/20261111130000_sales_opportunity_participants/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");

test("Sale participants expose the agreed operational roles", () => {
  assert.deepEqual(
    salesParticipantRoleOptions.map((option) => option.value),
    [
      "PRIMARY_CUSTOMER",
      "JOINT_APPLICANT",
      "DECISION_MAKER",
      "BILLING_CONTACT",
      "INSTALLER",
      "TECHNICAL_CONTACT",
    ],
  );
  assert.equal(salesParticipantRoleLabel("DECISION_MAKER"), "Decision-maker");
});

test("the current primary contact cannot be demoted without a replacement", () => {
  assert.deepEqual(
    saleParticipantRoleChangeDecision({
      isCurrentPrimary: true,
      nextRole: "JOINT_APPLICANT",
    }),
    {
      message:
        "The Sale's primary contact must keep the Primary customer role. Choose another primary customer first.",
      ok: false,
    },
  );
  assert.deepEqual(
    saleParticipantRoleChangeDecision({
      isCurrentPrimary: false,
      nextRole: "DECISION_MAKER",
    }),
    { ok: true },
  );
});

test("the participant schema retains the existing primary contact link", () => {
  assert.match(schema, /model SalesOpportunityParticipant/);
  assert.match(schema, /participants\s+SalesOpportunityParticipant\[\]/);
  assert.match(schema, /contactId\s+String\?/);
});

test("the migration backfills primary participants without removing CRM data", () => {
  assert.match(migration, /FROM "SalesOpportunity"/);
  assert.match(migration, /WHERE "contactId" IS NOT NULL/);
  assert.match(migration, /one_primary_per_sale/);
  assert.match(migration, /WHERE "role" = 'PRIMARY_CUSTOMER'/);
  assert.doesNotMatch(
    migration,
    /DROP TABLE|TRUNCATE|DELETE FROM "SalesOpportunity"|DELETE FROM "Contact"/,
  );
});

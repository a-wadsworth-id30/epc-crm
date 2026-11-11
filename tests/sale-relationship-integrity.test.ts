import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { saleRelationshipFindings } from "../src/lib/sales/relationship-integrity";

const primaryCompany = { id: "company-1", name: "Example Energy" };
const primaryPerson = {
  companyIds: [primaryCompany.id],
  id: "person-1",
  name: "Jamie Example",
  primaryCompany,
};

test("reports a healthy canonical Person, participant and Company relationship", () => {
  assert.deepEqual(
    saleRelationshipFindings({
      participants: [
        {
          companyIds: [primaryCompany.id],
          personId: primaryPerson.id,
          role: "PRIMARY_CUSTOMER",
        },
      ],
      primaryPerson,
      saleCompany: primaryCompany,
    }),
    [],
  );
});

test("offers safe repairs for a missing participant and Sale Company", () => {
  const findings = saleRelationshipFindings({
    participants: [],
    primaryPerson,
    saleCompany: null,
  });

  assert.deepEqual(
    findings.map((finding) => finding.code),
    ["PRIMARY_PARTICIPANT_MISMATCH", "MISSING_SALE_COMPANY"],
  );
  assert.equal(findings[0]?.repairs[0]?.kind, "SYNC_PRIMARY_PARTICIPANT");
  assert.equal(findings[1]?.repairs[0]?.kind, "USE_PRIMARY_PERSON_COMPANY");
});

test("keeps a Company conflict explicit and offers both deliberate choices", () => {
  const findings = saleRelationshipFindings({
    participants: [
      {
        companyIds: [primaryCompany.id],
        personId: primaryPerson.id,
        role: "PRIMARY_CUSTOMER",
      },
    ],
    primaryPerson,
    saleCompany: { id: "company-2", name: "Another Company" },
  });
  const conflict = findings.find(
    (finding) => finding.code === "PRIMARY_PERSON_COMPANY_MISMATCH",
  );

  assert.deepEqual(
    conflict?.repairs.map((repair) => repair.kind),
    ["USE_PRIMARY_PERSON_COMPANY", "LINK_PRIMARY_PERSON_TO_SALE_COMPANY"],
  );
});

test("treats participants from other Companies as review information", () => {
  const findings = saleRelationshipFindings({
    participants: [
      {
        companyIds: [primaryCompany.id],
        personId: primaryPerson.id,
        role: "PRIMARY_CUSTOMER",
      },
      {
        companyIds: ["installer-company"],
        personId: "installer-1",
        role: "INSTALLER",
      },
    ],
    primaryPerson,
    saleCompany: primaryCompany,
  });

  assert.equal(findings[0]?.code, "MULTI_COMPANY_PARTICIPANTS");
  assert.equal(findings[0]?.severity, "review");
  assert.deepEqual(findings[0]?.repairs, []);
});

test("repair actions are permission scoped, audited and concurrency checked", () => {
  const action = readFileSync(
    "src/lib/actions/sale-relationship-integrity.ts",
    "utf8",
  );

  assert.match(action, /salesOpportunityIdAccessWhere/);
  assert.match(action, /companyIdAccessWhere/);
  assert.match(action, /contactIdAccessWhere/);
  assert.match(action, /sale\.relationship_repaired/);
  assert.match(action, /updateMany/);
  assert.match(action, /Refresh and review it again/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRelationshipHealthRows,
  relationshipHealthRows,
  relationshipHealthSummary,
  type RelationshipHealthSale,
} from "../src/lib/sales/relationship-health";

const company = { id: "company-1", name: "Example Energy" };

function sale(
  overrides: Partial<RelationshipHealthSale> = {},
): RelationshipHealthSale {
  return {
    company,
    id: "sale-1",
    participants: [],
    primaryPerson: {
      company,
      companyAffiliations: [{ companyId: company.id }],
      companyId: company.id,
      firstName: "Jamie",
      id: "person-1",
      lastName: "Example",
    },
    title: "Whole-home upgrade",
    ...overrides,
  };
}

test("relationship health excludes Sales with no findings", () => {
  const healthy = sale({
    participants: [
      {
        contact: {
          companyAffiliations: [{ companyId: company.id }],
          companyId: company.id,
          id: "person-1",
        },
        role: "PRIMARY_CUSTOMER",
      },
    ],
  });

  assert.deepEqual(relationshipHealthRows([healthy]), []);
});

test("relationship health summarises and filters actionable findings", () => {
  const rows = relationshipHealthRows([
    sale(),
    sale({ id: "sale-2", primaryPerson: null }),
  ]);
  const summary = relationshipHealthSummary(rows);

  assert.equal(summary.sales, 2);
  assert.equal(summary.warning, 2);
  assert.equal(summary.byCode.PRIMARY_PARTICIPANT_MISMATCH, 1);
  assert.equal(
    filterRelationshipHealthRows(rows, {
      code: "MISSING_PRIMARY_PERSON",
    })[0]?.id,
    "sale-2",
  );
});

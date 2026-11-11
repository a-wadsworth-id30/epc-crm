import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { companyRelatedSalesWhere } from "../src/lib/companies/related-sales";

test("Company Sales include direct, primary-Person and participant relationships", () => {
  assert.deepEqual(companyRelatedSalesWhere("company-1"), {
    OR: [
      { companyId: "company-1" },
      {
        contact: {
          companyAffiliations: { some: { companyId: "company-1" } },
        },
      },
      {
        participants: {
          some: {
            contact: {
              companyAffiliations: { some: { companyId: "company-1" } },
            },
          },
        },
      },
    ],
  });
});

test("Company detail reuses one related-Sales scope for rows, counts and activity", () => {
  const page = readFileSync("src/app/(admin)/clients/[id]/page.tsx", "utf8");

  assert.match(page, /companyRelatedSalesWhere/);
  assert.match(page, /relatedCompanySalesCount/);
  assert.match(page, /relationshipLabel/);
  assert.match(page, /activityCommunications/);
  assert.doesNotMatch(
    page,
    /where: salesOpportunityWhereWithAccess\(user, \{\s*companyId/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { companyOperationalOverview } from "../src/lib/companies/operational-overview";

test("Company operational overview prioritises actionable existing workflow gaps", () => {
  const result = companyOperationalOverview({
    activeSalesCount: 3,
    activeSalesMissingNextStepCount: 2,
    hasOwner: false,
    hasPrimaryContact: false,
    latestActivityAt: "2026-11-11T12:00:00.000Z",
    linkedContactsCount: 4,
    missingProfileFieldCount: 1,
    missingRequiredDocumentCount: 2,
    openTaskCount: 5,
    overdueTaskCount: 1,
    profileIsConfigured: true,
  });

  assert.equal(result.activeSalesCount, 3);
  assert.equal(result.openTaskCount, 5);
  assert.deepEqual(
    result.attention.map((item) => item.key),
    [
      "overdue-tasks",
      "missing-next-actions",
      "missing-documents",
      "missing-profile",
      "missing-owner",
      "missing-primary-contact",
    ],
  );
});

test("Company operational overview does not invent requirements", () => {
  const result = companyOperationalOverview({
    activeSalesCount: 0,
    activeSalesMissingNextStepCount: 0,
    hasOwner: true,
    hasPrimaryContact: false,
    latestActivityAt: null,
    linkedContactsCount: 0,
    missingProfileFieldCount: 3,
    missingRequiredDocumentCount: 0,
    openTaskCount: 0,
    overdueTaskCount: 0,
    profileIsConfigured: false,
  });

  assert.deepEqual(result.attention, []);
});

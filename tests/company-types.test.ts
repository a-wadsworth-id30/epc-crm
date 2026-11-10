import assert from "node:assert/strict";
import test from "node:test";
import {
  companyTypeArchiveBlockReason,
  companyTypeSlugBase,
  defaultCompanyTypeAssignment,
  systemCompanyTypeId,
} from "../src/lib/companies/company-types";

test("company type slugs are stable and URL safe", () => {
  assert.equal(companyTypeSlugBase("Installer & Trade Partner"), "installer-trade-partner");
  assert.equal(companyTypeSlugBase("  Àçmé Limited  "), "acme-limited");
  assert.equal(companyTypeSlugBase("***"), "company-type");
  assert.equal(companyTypeSlugBase("a".repeat(80)).length, 64);
});

test("system company type IDs remain stable for migrations and integrations", () => {
  assert.equal(systemCompanyTypeId("OTHER"), "company-type-other");
  assert.equal(
    systemCompanyTypeId("INSTALLER_COMPANY"),
    "company-type-installer-company",
  );
  assert.deepEqual(defaultCompanyTypeAssignment(), {
    companyTypeId: "company-type-other",
  });
});

test("company types cannot be archived while default or populated", () => {
  assert.equal(
    companyTypeArchiveBlockReason({
      companyCount: 0,
      isDefault: true,
      name: "Other",
    }),
    "Choose another default type before archiving this one.",
  );
  assert.equal(
    companyTypeArchiveBlockReason({
      companyCount: 2,
      isDefault: false,
      name: "Supplier",
    }),
    "Reassign 2 companies before archiving Supplier.",
  );
  assert.equal(
    companyTypeArchiveBlockReason({
      companyCount: 0,
      isDefault: false,
      name: "Supplier",
    }),
    null,
  );
});

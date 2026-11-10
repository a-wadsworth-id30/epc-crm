import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCompanyMatchName,
  uniqueCompanyMatchByName,
  uniqueCompanyMatchesByName,
} from "../src/lib/companies/integration-matching";

test("company integration matching normalises case and spacing", () => {
  assert.equal(normalizeCompanyMatchName("  Example   LTD "), "example ltd");
});

test("company integration matching reuses one unambiguous company", () => {
  const company = uniqueCompanyMatchByName(
    [{ id: "company-1", name: "Example Ltd" }],
    "example ltd",
  );
  assert.equal(company?.id, "company-1");
});

test("company integration matching refuses ambiguous names", () => {
  const companies = [
    { id: "company-1", name: "Example Ltd" },
    { id: "company-2", name: "EXAMPLE LTD" },
  ];
  assert.equal(uniqueCompanyMatchByName(companies, "Example Ltd"), null);
  assert.equal(uniqueCompanyMatchesByName(companies).size, 0);
});

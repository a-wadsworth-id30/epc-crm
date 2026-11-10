import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync(
  "prisma/migrations/20261110233000_company_custom_fields/migration.sql",
  "utf8",
);
const settingsNav = readFileSync(
  "src/components/crm-boilerplate/SettingsNav.tsx",
  "utf8",
);

test("company configurable fields keep definitions and typed values separate", () => {
  assert.match(schema, /model CompanyTypeField \{/);
  assert.match(schema, /model CompanyCustomFieldValue \{/);
  assert.match(schema, /@@unique\(\[companyTypeId, key\]\)/);
  assert.match(schema, /@@unique\(\[companyId, fieldId\]\)/);
});

test("company custom field migration preserves values during configuration changes", () => {
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /CompanyCustomFieldValue_companyId_fieldId_key/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM "Company"/);
});

test("company type configuration is available from Settings", () => {
  assert.match(settingsNav, /Company Types/);
  assert.match(settingsNav, /\/settings\/company-types/);
});

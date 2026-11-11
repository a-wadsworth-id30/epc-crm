import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { companyHierarchyDecision } from "../src/lib/companies/hierarchy";

const migration = readFileSync(
  "prisma/migrations/20261111121500_company_hierarchy/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");
const actions = readFileSync("src/lib/actions/companies.ts", "utf8");

test("an independent Company can remain without a parent", () => {
  assert.deepEqual(
    companyHierarchyDecision({
      ancestorIds: [],
      companyId: "company-a",
      parentCompanyId: null,
    }),
    { ok: true },
  );
});

test("a Company cannot be its own parent", () => {
  const decision = companyHierarchyDecision({
    ancestorIds: ["company-a"],
    companyId: "company-a",
    parentCompanyId: "company-a",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /own parent/);
});

test("a descendant cannot become the parent of its ancestor", () => {
  const decision = companyHierarchyDecision({
    ancestorIds: ["company-c", "company-b", "company-a"],
    companyId: "company-a",
    parentCompanyId: "company-c",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.match(decision.message, /circular/);
});

test("a valid parent chain is accepted", () => {
  assert.deepEqual(
    companyHierarchyDecision({
      ancestorIds: ["group", "holding-company"],
      companyId: "regional-branch",
      parentCompanyId: "group",
    }),
    { ok: true },
  );
});

test("the hierarchy migration is additive and detaches children on parent deletion", () => {
  assert.match(schema, /parentCompanyId\s+String\?/);
  assert.match(schema, /@relation\("CompanyHierarchy"/);
  assert.match(migration, /ADD COLUMN "parentCompanyId" TEXT/);
  assert.match(migration, /Company_parentCompanyId_not_self/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM "Company"/);
});

test("hierarchy writes are access checked, audited and serializable", () => {
  assert.match(actions, /companyWhereWithAccess\(user/);
  assert.match(actions, /company\.parent_updated/);
  assert.match(actions, /isolationLevel: "Serializable"/);
});

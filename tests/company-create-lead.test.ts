import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const companyPage = readFileSync(
  "src/app/(admin)/clients/[id]/page.tsx",
  "utf8",
);
const addSaleModal = readFileSync(
  "src/components/crm-boilerplate/AddSaleModal.tsx",
  "utf8",
);
const salesActions = readFileSync("src/lib/actions/sales.ts", "utf8");

test("Company detail exposes a prefilled Create lead workflow", () => {
  assert.match(companyPage, /DeferredAddSaleModal/);
  assert.match(
    companyPage,
    /linkedCompany=\{\{ id: company\.id, name: company\.name \}\}/,
  );
  assert.match(companyPage, /contacts=\{company\.contactAffiliations\.map/);
  assert.match(companyPage, /triggerLabel="Create lead"/);
});

test("Company lead creation requires an explicit affiliated primary Person", () => {
  assert.match(addSaleModal, /name="saleCompanyId"/);
  assert.match(addSaleModal, /Choose an affiliated Person/);
  assert.match(
    addSaleModal,
    /Link a Person to this Company before creating its lead/,
  );
  assert.match(addSaleModal, /linkedCompany && !contacts\.length/);
});

test("server validation rejects unrelated Person and Company submissions", () => {
  assert.match(salesActions, /saleCompanyId/);
  assert.match(
    salesActions,
    /companyIdAccessWhere\(parsed\.data\.saleCompanyId, user\)/,
  );
  assert.match(salesActions, /linkedContact\.companyAffiliations\.some/);
  assert.match(salesActions, /Choose a Person affiliated with this Company/);
  assert.match(
    salesActions,
    /selectedSaleCompany\?\.id \?\? linkedContact\?\.companyId/,
  );
});

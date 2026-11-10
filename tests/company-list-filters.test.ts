import assert from "node:assert/strict";
import test from "node:test";
import { ContactCustomFieldType } from "@prisma/client";
import {
  companyCustomFieldFiltersWhere,
  parseCompanyCustomFieldFilters,
  writeCompanyCustomFieldFilterParams,
} from "../src/lib/companies/filters";
import { companySearchWhere } from "../src/lib/companies/query";
import { companyTableCustomFields } from "../src/lib/companies/table-columns";

const fields = [
  {
    fieldType: ContactCustomFieldType.SINGLE_SELECT,
    id: "status-field",
    options: ["Approved", "Pending"],
  },
  {
    fieldType: ContactCustomFieldType.BOOLEAN,
    id: "verified",
    options: [],
  },
  {
    fieldType: ContactCustomFieldType.DATE,
    id: "renewal",
    options: [],
  },
];

test("company structured filters round-trip through URL parameters", () => {
  const params = new URLSearchParams();
  writeCompanyCustomFieldFilterParams(params, {
    "status-field": "Approved",
    verified: "false",
    renewal: { from: "2026-01-01", to: "2026-12-31" },
  });

  assert.deepEqual(parseCompanyCustomFieldFilters(params, fields), {
    "status-field": "Approved",
    verified: "false",
    renewal: { from: "2026-01-01", to: "2026-12-31" },
  });
});

test("company structured filters produce typed database conditions", () => {
  const where = companyCustomFieldFiltersWhere(
    { "status-field": "Approved", verified: "true" },
    fields,
  );
  assert.equal(Array.isArray(where?.AND) ? where.AND.length : 0, 2);
});

test("company search includes authorised searchable custom fields", () => {
  const where = companySearchWhere("MCS", ["accreditation"]);
  const serialized = JSON.stringify(where);
  assert.match(serialized, /accreditation/);
  assert.match(serialized, /isSearchable/);
});

test("company custom table columns appear only inside a selected type", () => {
  const definitions = [
    { companyTypeId: "installer", id: "mcs", showInTable: true },
    { companyTypeId: "supplier", id: "account", showInTable: true },
  ];
  assert.deepEqual(
    companyTableCustomFields({
      activeCompanyTypeId: null,
      fields: definitions,
    }),
    [],
  );
  assert.deepEqual(
    companyTableCustomFields({
      activeCompanyTypeId: "installer",
      fields: definitions,
    }).map((field) => field.id),
    ["mcs"],
  );
});

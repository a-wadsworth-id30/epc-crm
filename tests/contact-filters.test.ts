import assert from "node:assert/strict";
import test from "node:test";
import { ContactCustomFieldType } from "@prisma/client";
import {
  contactCustomFieldFiltersWhere,
  parseContactCustomFieldFilters,
  writeContactCustomFieldFilterParams,
} from "../src/lib/contacts/filters";

const fields = [
  {
    fieldType: ContactCustomFieldType.SINGLE_SELECT,
    id: "status",
    options: ["Active", "Inactive"],
  },
  {
    fieldType: ContactCustomFieldType.MULTI_SELECT,
    id: "areas",
    options: ["Yorkshire", "Lancashire"],
  },
  {
    fieldType: ContactCustomFieldType.BOOLEAN,
    id: "approved",
    options: [],
  },
  {
    fieldType: ContactCustomFieldType.DATE,
    id: "expiry",
    options: [],
  },
];

test("custom contact filters round-trip through URL parameters", () => {
  const params = new URLSearchParams("q=installer&cf.unknown=ignored");
  writeContactCustomFieldFilterParams(params, {
    approved: "false",
    areas: ["Yorkshire", "Lancashire"],
    expiry: { from: "2026-01-01", to: "2026-12-31" },
    status: "Active",
  });

  assert.equal(params.get("q"), "installer");
  assert.deepEqual(params.getAll("cf.areas"), ["Yorkshire", "Lancashire"]);
  assert.deepEqual(parseContactCustomFieldFilters(params, fields), {
    approved: "false",
    areas: ["Yorkshire", "Lancashire"],
    expiry: { from: "2026-01-01", to: "2026-12-31" },
    status: "Active",
  });
});

test("custom contact filters reject unknown options and malformed values", () => {
  const params = new URLSearchParams(
    "cf.status=Suspended&cf.approved=maybe&cf.expiry.from=tomorrow",
  );
  assert.deepEqual(parseContactCustomFieldFilters(params, fields), {});
});

test("custom contact filters build typed database conditions", () => {
  const where = contactCustomFieldFiltersWhere(
    {
      approved: "true",
      areas: ["Yorkshire"],
      expiry: { to: "2026-12-31" },
      status: "Active",
    },
    fields,
  );

  assert.ok(where?.AND);
  assert.equal(Array.isArray(where?.AND) ? where.AND.length : 0, 4);
  assert.deepEqual(
    Array.isArray(where?.AND) ? where.AND[0] : null,
    {
      customFieldValues: {
        some: { booleanValue: true, fieldId: "approved" },
      },
    },
  );
});

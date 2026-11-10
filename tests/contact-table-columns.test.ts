import assert from "node:assert/strict";
import test from "node:test";
import {
  contactCustomFieldDisplayValue,
  contactCustomTableColumnId,
  contactTableColumnIds,
  contactTableCustomFields,
  defaultVisibleContactColumnIds,
  parseVisibleContactColumnIds,
  serializeVisibleContactColumnIds,
} from "../src/lib/contacts/table-columns";

const fields = [
  { contactTypeId: "installer", id: "licence", showInTable: true },
  { contactTypeId: "trade", id: "region", showInTable: true },
  { contactTypeId: "installer", id: "private", showInTable: false },
];

test("table custom fields respect visibility and the selected person type", () => {
  assert.deepEqual(
    contactTableCustomFields({ activeContactTypeId: "installer", fields }),
    [fields[0]],
  );
  assert.deepEqual(
    contactTableCustomFields({ activeContactTypeId: null, fields }),
    fields.slice(0, 2),
  );
});

test("custom columns are stable, default-visible and preserved in preferences", () => {
  const selectedFields = contactTableCustomFields({
    activeContactTypeId: "installer",
    fields,
  });
  const availableColumnIds = contactTableColumnIds(selectedFields);
  const defaultColumnIds = defaultVisibleContactColumnIds(selectedFields);
  const customId = contactCustomTableColumnId("licence");

  assert.ok(availableColumnIds.includes(customId));
  assert.ok(defaultColumnIds.includes(customId));
  assert.deepEqual(
    parseVisibleContactColumnIds({
      availableColumnIds,
      defaultColumnIds,
      value: `name,email,${customId},unknown`,
    }),
    ["name", "email", customId],
  );
  assert.equal(
    serializeVisibleContactColumnIds({
      availableColumnIds,
      defaultColumnIds,
      selectedColumnIds: defaultColumnIds,
    }),
    null,
  );
});

test("custom field values have readable table fallbacks", () => {
  assert.equal(contactCustomFieldDisplayValue(true), "Yes");
  assert.equal(contactCustomFieldDisplayValue(false), "No");
  assert.equal(
    contactCustomFieldDisplayValue(["Heat pump", "Solar"]),
    "Heat pump, Solar",
  );
  assert.equal(contactCustomFieldDisplayValue(null), "Not set");
});

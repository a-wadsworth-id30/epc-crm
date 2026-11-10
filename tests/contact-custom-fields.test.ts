import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
  Prisma,
} from "@prisma/client";
import {
  contactCustomFieldKey,
  parseContactCustomFieldOptions,
  parseContactCustomFieldSubmission,
  serializeContactCustomFieldValue,
  type ContactCustomFieldDefinition,
} from "../src/lib/contacts/custom-fields";

function field(
  overrides: Partial<ContactCustomFieldDefinition> = {},
): ContactCustomFieldDefinition {
  return {
    contactTypeId: "installer",
    displayOrder: 10,
    externalEditable: false,
    fieldType: ContactCustomFieldType.SHORT_TEXT,
    helpText: null,
    id: "field-1",
    isActive: true,
    isSearchable: false,
    key: "accreditation_number",
    label: "Accreditation number",
    options: [],
    placeholder: null,
    requirementMode: ContactFieldRequirementMode.OPTIONAL,
    showInTable: false,
    ...overrides,
  };
}

test("custom field keys and options are stable and deduplicated", () => {
  assert.equal(contactCustomFieldKey("  Driving Licence No.  "), "driving_licence_no");
  assert.deepEqual(
    parseContactCustomFieldOptions("Gas Safe, MCS\nGas Safe\nTrustMark"),
    ["Gas Safe", "MCS", "TrustMark"],
  );
});

test("required custom fields are enforced server-side", () => {
  const result = parseContactCustomFieldSubmission(
    [field({ requirementMode: ContactFieldRequirementMode.REQUIRED })],
    new FormData(),
  );

  assert.deepEqual(result, {
    message: "Accreditation number: this field is required.",
    ok: false,
  });
});

test("completeness fields do not block saving an incomplete profile", () => {
  const result = parseContactCustomFieldSubmission(
    [field({ requirementMode: ContactFieldRequirementMode.COMPLETENESS })],
    new FormData(),
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.values[0]?.textValue, null);
});

test("typed custom field submissions produce isolated typed values", () => {
  const definitions = [
    field({ id: "number", fieldType: ContactCustomFieldType.NUMBER, label: "Years trading" }),
    field({ id: "date", fieldType: ContactCustomFieldType.DATE, label: "Licence expiry" }),
    field({ id: "boolean", fieldType: ContactCustomFieldType.BOOLEAN, label: "Verified" }),
    field({
      id: "multi",
      fieldType: ContactCustomFieldType.MULTI_SELECT,
      label: "Trades",
      options: ["Solar", "Insulation", "Heating"],
    }),
  ];
  const formData = new FormData();
  formData.set("customField:number", "12.5");
  formData.set("customField:date", "2027-06-30");
  formData.set("customField:boolean", "false");
  formData.append("customField:multi", "Solar");
  formData.append("customField:multi", "Heating");

  const result = parseContactCustomFieldSubmission(definitions, formData);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.values[0]?.numberValue?.toString(), "12.5");
  assert.equal(result.values[1]?.dateValue?.toISOString(), "2027-06-30T00:00:00.000Z");
  assert.equal(result.values[2]?.booleanValue, false);
  assert.deepEqual(result.values[3]?.jsonValue, ["Solar", "Heating"]);
});

test("select values must match configured options", () => {
  const formData = new FormData();
  formData.set("customField:field-1", "Unapproved");
  const result = parseContactCustomFieldSubmission(
    [field({ fieldType: ContactCustomFieldType.SINGLE_SELECT, options: ["Approved", "Pending"] })],
    formData,
  );

  assert.equal(result.ok, false);
});

test("stored typed values serialize for contact forms", () => {
  assert.equal(
    serializeContactCustomFieldValue({
      booleanValue: null,
      dateValue: null,
      fieldId: "field",
      jsonValue: null,
      numberValue: new Prisma.Decimal("18.25"),
      textValue: null,
    }),
    "18.25",
  );
  assert.deepEqual(
    serializeContactCustomFieldValue({
      booleanValue: null,
      dateValue: null,
      fieldId: "field",
      jsonValue: ["Solar", "Heating"],
      numberValue: null,
      textValue: null,
    }),
    ["Solar", "Heating"],
  );
});

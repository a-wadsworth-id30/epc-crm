import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
} from "@prisma/client";
import type { ContactCustomFieldDefinition } from "../src/lib/contacts/custom-fields";
import { mappedPipedriveContactFieldWrites } from "../src/lib/integrations/pipedrive-contact-field-mapping";

function field(
  id: string,
  label: string,
  fieldType: ContactCustomFieldType,
  options: string[] = [],
): ContactCustomFieldDefinition {
  return {
    contactTypeId: "consumer",
    displayOrder: 10,
    externalEditable: false,
    fieldType,
    helpText: null,
    id,
    isActive: true,
    isSearchable: false,
    key: id,
    label,
    options,
    placeholder: null,
    requirementMode: ContactFieldRequirementMode.OPTIONAL,
    showInTable: false,
  };
}

test("Pipedrive mappings produce typed CRM contact values", () => {
  const result = mappedPipedriveContactFieldWrites({
    definitions: [
      field("status", "Status", ContactCustomFieldType.SINGLE_SELECT, [
        "Active",
        "Inactive",
      ]),
      field("approved", "Approved", ContactCustomFieldType.BOOLEAN),
      field("renewal", "Renewal", ContactCustomFieldType.DATE),
      field("areas", "Areas", ContactCustomFieldType.MULTI_SELECT, [
        "Yorkshire",
        "Lancashire",
      ]),
    ],
    mappings: [
      { contactFieldId: "status", sourceFieldKey: "crm_status" },
      { contactFieldId: "approved", sourceFieldKey: "approved_flag" },
      { contactFieldId: "renewal", sourceFieldKey: "renewal_date" },
      { contactFieldId: "areas", sourceFieldKey: "coverage" },
    ],
    person: {
      approved_flag: "yes",
      coverage: [{ value: "Yorkshire" }, { value: "Lancashire" }],
      crm_status: { value: "Active" },
      renewal_date: "2027-05-14T10:00:00Z",
    },
  });

  assert.equal(result.warnings.length, 0);
  assert.equal(result.values.length, 4);
  assert.equal(
    result.values.find((value) => value.fieldId === "status")?.textValue,
    "Active",
  );
  assert.equal(
    result.values.find((value) => value.fieldId === "approved")?.booleanValue,
    true,
  );
  assert.deepEqual(
    result.values.find((value) => value.fieldId === "areas")?.jsonValue,
    ["Yorkshire", "Lancashire"],
  );
});

test("invalid mapped values are skipped with a readable warning", () => {
  const result = mappedPipedriveContactFieldWrites({
    definitions: [
      field("status", "Status", ContactCustomFieldType.SINGLE_SELECT, [
        "Active",
        "Inactive",
      ]),
    ],
    mappings: [{ contactFieldId: "status", sourceFieldKey: "crm_status" }],
    person: { crm_status: "Suspended" },
  });

  assert.deepEqual(result.values, []);
  assert.match(result.warnings[0] ?? "", /Status could not be imported/);
});

test("empty Pipedrive values do not erase CRM data", () => {
  const result = mappedPipedriveContactFieldWrites({
    definitions: [field("notes", "Notes", ContactCustomFieldType.LONG_TEXT)],
    mappings: [{ contactFieldId: "notes", sourceFieldKey: "notes" }],
    person: { notes: null },
  });

  assert.deepEqual(result, { values: [], warnings: [] });
});

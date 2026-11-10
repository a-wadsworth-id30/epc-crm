import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
  Prisma,
} from "@prisma/client";
import {
  parseCompanyCustomFieldSubmission,
  serializeCompanyCustomFieldValue,
  type CompanyCustomFieldDefinition,
} from "../src/lib/companies/custom-fields";
import {
  canEditCompanyField,
  visibleCompanyFields,
} from "../src/lib/companies/field-access";

function field(
  overrides: Partial<CompanyCustomFieldDefinition> = {},
): CompanyCustomFieldDefinition {
  return {
    companyTypeId: "installer-company",
    displayOrder: 10,
    externalEditable: false,
    fieldType: ContactCustomFieldType.SHORT_TEXT,
    helpText: null,
    id: "field-1",
    isActive: true,
    isSearchable: false,
    key: "registration_number",
    label: "Registration number",
    options: [],
    placeholder: null,
    requirementMode: ContactFieldRequirementMode.OPTIONAL,
    showInTable: false,
    ...overrides,
  };
}

test("required company fields are validated by the shared typed pipeline", () => {
  const result = parseCompanyCustomFieldSubmission(
    [field({ requirementMode: ContactFieldRequirementMode.REQUIRED })],
    new FormData(),
  );
  assert.deepEqual(result, {
    message: "Registration number: this field is required.",
    ok: false,
  });
});

test("company select and numeric values remain typed", () => {
  const formData = new FormData();
  formData.set("customField:status", "Approved");
  formData.set("customField:employees", "24");
  const result = parseCompanyCustomFieldSubmission(
    [
      field({
        id: "status",
        fieldType: ContactCustomFieldType.SINGLE_SELECT,
        options: ["Approved", "Pending"],
      }),
      field({ id: "employees", fieldType: ContactCustomFieldType.NUMBER }),
    ],
    formData,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.values[0]?.textValue, "Approved");
  assert.equal(result.values[1]?.numberValue?.toString(), "24");
});

test("company values serialize safely for edit forms", () => {
  assert.equal(
    serializeCompanyCustomFieldValue({
      booleanValue: null,
      dateValue: null,
      fieldId: "employees",
      jsonValue: null,
      numberValue: new Prisma.Decimal("24"),
      textValue: null,
    }),
    "24",
  );
});

test("company field role restrictions prevent hidden values reaching forms", () => {
  const salesUser = { role: "USER" as const, roleTemplate: "sales-user" };
  const fields = [
    field({ id: "open" }),
    field({ id: "support", viewRoleTemplates: ["support-user"] }),
    field({
      id: "read-only",
      viewRoleTemplates: ["sales-user"],
      editRoleTemplates: ["manager"],
    }),
  ];
  assert.deepEqual(
    visibleCompanyFields(fields, salesUser).map((item) => item.id),
    ["open", "read-only"],
  );
  assert.equal(canEditCompanyField(fields[2]!, salesUser), false);
});

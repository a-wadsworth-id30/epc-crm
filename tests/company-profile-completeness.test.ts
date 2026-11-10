import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
} from "@prisma/client";
import type { CompanyCustomFieldDefinition } from "../src/lib/companies/custom-fields";
import { companyProfileCompleteness } from "../src/lib/companies/profile-completeness";

function field(
  id: string,
  requirementMode: ContactFieldRequirementMode,
  companyTypeId = "installer-company",
): CompanyCustomFieldDefinition {
  return {
    companyTypeId,
    displayOrder: 10,
    externalEditable: false,
    fieldType: ContactCustomFieldType.SHORT_TEXT,
    helpText: null,
    id,
    isActive: true,
    isSearchable: false,
    key: id,
    label: id === "insurance" ? "Insurance" : "Registration number",
    options: [],
    placeholder: null,
    requirementMode,
    showInTable: false,
  };
}

test("company completeness uses required and completeness fields for the selected type", () => {
  const result = companyProfileCompleteness({
    companyTypeId: "installer-company",
    definitions: [
      field("registration", ContactFieldRequirementMode.REQUIRED),
      field("insurance", ContactFieldRequirementMode.COMPLETENESS),
      field("notes", ContactFieldRequirementMode.OPTIONAL),
      field("supplier-id", ContactFieldRequirementMode.REQUIRED, "supplier"),
    ],
    values: { registration: "12345" },
  });

  assert.equal(result.completed, 1);
  assert.equal(result.total, 2);
  assert.equal(result.percentage, 50);
  assert.deepEqual(result.missing, [
    { fieldId: "insurance", label: "Insurance" },
  ]);
});

test("an unconfigured company type does not display as zero percent complete", () => {
  const result = companyProfileCompleteness({
    companyTypeId: "other",
    definitions: [],
    values: {},
  });

  assert.equal(result.isConfigured, false);
  assert.equal(result.percentage, 0);
});

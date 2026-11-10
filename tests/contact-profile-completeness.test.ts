import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
} from "@prisma/client";
import type { ContactCustomFieldDefinition } from "../src/lib/contacts/custom-fields";
import {
  contactProfileCompleteness,
  hasContactCustomFieldFormValue,
} from "../src/lib/contacts/profile-completeness";

function field(
  id: string,
  requirementMode: ContactFieldRequirementMode,
  overrides: Partial<ContactCustomFieldDefinition> = {},
): ContactCustomFieldDefinition {
  return {
    contactTypeId: "installer",
    displayOrder: 10,
    externalEditable: false,
    fieldType: ContactCustomFieldType.SHORT_TEXT,
    helpText: null,
    id,
    isActive: true,
    isSearchable: false,
    key: id,
    label: id,
    options: [],
    placeholder: null,
    requirementMode,
    showInTable: false,
    ...overrides,
  };
}

test("profile completeness counts required and completeness fields only", () => {
  const result = contactProfileCompleteness({
    contactTypeId: "installer",
    definitions: [
      field("licence", ContactFieldRequirementMode.REQUIRED),
      field("insurance", ContactFieldRequirementMode.COMPLETENESS),
      field("notes", ContactFieldRequirementMode.OPTIONAL),
      field("trade-field", ContactFieldRequirementMode.COMPLETENESS, { contactTypeId: "trade" }),
    ],
    values: { licence: "ABC123" },
  });

  assert.deepEqual(result, {
    completed: 1,
    isComplete: false,
    isConfigured: true,
    missing: [{ fieldId: "insurance", label: "insurance" }],
    percentage: 50,
    total: 2,
  });
});

test("false and zero are complete values while blanks and empty arrays are not", () => {
  assert.equal(hasContactCustomFieldFormValue(false), true);
  assert.equal(hasContactCustomFieldFormValue("0"), true);
  assert.equal(hasContactCustomFieldFormValue("  "), false);
  assert.equal(hasContactCustomFieldFormValue([]), false);
});

test("profile completeness reports a configured complete profile", () => {
  const result = contactProfileCompleteness({
    contactTypeId: "installer",
    definitions: [
      field("verified", ContactFieldRequirementMode.COMPLETENESS),
      field("trades", ContactFieldRequirementMode.COMPLETENESS),
    ],
    values: { verified: false, trades: ["Solar"] },
  });

  assert.equal(result.percentage, 100);
  assert.equal(result.isComplete, true);
  assert.deepEqual(result.missing, []);
});

test("an unconfigured person type is not presented as zero percent complete", () => {
  const result = contactProfileCompleteness({
    contactTypeId: "consumer",
    definitions: [field("licence", ContactFieldRequirementMode.COMPLETENESS)],
    values: {},
  });

  assert.equal(result.isConfigured, false);
  assert.equal(result.percentage, 0);
  assert.equal(result.total, 0);
});

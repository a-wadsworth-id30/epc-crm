import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
} from "@prisma/client";
import {
  contactImportTemplateCsv,
  parseContactImportCsv,
  type ContactImportType,
} from "../src/lib/contacts/import";

const types: ContactImportType[] = [
  {
    id: "installer",
    name: "Installer",
    slug: "installer",
    systemKey: "INSTALLER",
    fields: [
      {
        contactTypeId: "installer",
        displayOrder: 1,
        externalEditable: false,
        fieldType: ContactCustomFieldType.SHORT_TEXT,
        helpText: null,
        id: "licence-field",
        isActive: true,
        isSearchable: true,
        key: "licence_number",
        label: "Licence number",
        options: [],
        placeholder: null,
        requirementMode: ContactFieldRequirementMode.REQUIRED,
        showInTable: true,
      },
      {
        contactTypeId: "installer",
        displayOrder: 2,
        externalEditable: false,
        fieldType: ContactCustomFieldType.MULTI_SELECT,
        helpText: null,
        id: "skills-field",
        isActive: true,
        isSearchable: true,
        key: "skills",
        label: "Skills",
        options: ["Solar", "Heating"],
        placeholder: null,
        requirementMode: ContactFieldRequirementMode.OPTIONAL,
        showInTable: true,
      },
    ],
  },
];

test("contact import validates person types and typed custom fields", () => {
  const parsed = parseContactImportCsv(
    "personType,firstName,lastName,email,phone,leadSource,custom:licence_number,custom:skills\ninstaller,Jane,Smith,jane@example.com,,Referral,MCS-123,Solar|Heating\n",
    types,
  );

  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.candidates.length, 1);
  assert.deepEqual(parsed.candidates[0]?.customValues, {
    licence_number: ["MCS-123"],
    skills: ["Solar", "Heating"],
  });
});

test("contact import rejects missing required custom fields and duplicates", () => {
  const parsed = parseContactImportCsv(
    "personType,firstName,lastName,email,leadSource,custom:licence_number\ninstaller,Jane,Smith,jane@example.com,Referral,\ninstaller,Janet,Smith,jane@example.com,Referral,MCS-2\n",
    types,
  );

  assert.equal(parsed.candidates.length, 1);
  assert.match(parsed.issues[0]?.reason ?? "", /required/i);
});

test("contact import rejects unknown custom-field keys", () => {
  const parsed = parseContactImportCsv(
    "personType,firstName,lastName,email,leadSource,custom:unknown\ninstaller,Jane,Smith,jane@example.com,Referral,value\n",
    types,
  );

  assert.equal(parsed.candidates.length, 0);
  assert.match(parsed.issues[0]?.reason ?? "", /Unknown custom field key/);
});

test("contact import treats a repeated phone as a duplicate identity", () => {
  const parsed = parseContactImportCsv(
    "personType,firstName,lastName,email,phone,leadSource,custom:licence_number\ninstaller,Jane,Smith,jane@example.com,07123456789,Referral,MCS-1\ninstaller,Janet,Jones,janet@example.com,07123456789,Referral,MCS-2\n",
    types,
  );

  assert.equal(parsed.candidates.length, 1);
  assert.match(parsed.issues[0]?.reason ?? "", /Duplicate person/);
});

test("contact import template exposes stable slugs and custom keys", () => {
  const template = contactImportTemplateCsv(types);
  assert.match(template, /custom:licence_number/);
  assert.match(template, /installer,Jane,Smith/);
});

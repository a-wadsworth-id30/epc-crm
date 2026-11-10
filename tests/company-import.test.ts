import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactCustomFieldType,
  ContactFieldRequirementMode,
} from "@prisma/client";
import {
  companyImportIdentity,
  companyImportTemplateCsv,
  parseCompanyImportCsv,
  type CompanyImportType,
} from "../src/lib/companies/import";

const types: CompanyImportType[] = [
  {
    id: "installer-company",
    name: "Installer Company",
    slug: "installer-company",
    fields: [
      {
        companyTypeId: "installer-company",
        displayOrder: 1,
        externalEditable: false,
        fieldType: ContactCustomFieldType.SHORT_TEXT,
        helpText: null,
        id: "registration-field",
        isActive: true,
        isSearchable: true,
        key: "registration_number",
        label: "Registration number",
        options: [],
        placeholder: null,
        requirementMode: ContactFieldRequirementMode.REQUIRED,
        showInTable: true,
      },
      {
        companyTypeId: "installer-company",
        displayOrder: 2,
        externalEditable: false,
        fieldType: ContactCustomFieldType.MULTI_SELECT,
        helpText: null,
        id: "technologies-field",
        isActive: true,
        isSearchable: true,
        key: "technologies",
        label: "Technologies",
        options: ["Solar", "Heating"],
        placeholder: null,
        requirementMode: ContactFieldRequirementMode.OPTIONAL,
        showInTable: true,
      },
    ],
  },
];

test("company import validates type, status and typed fields", () => {
  const parsed = parseCompanyImportCsv(
    "companyType,name,domain,status,custom:registration_number,custom:technologies\ninstaller-company,Example Ltd,https://www.example.com/path,Active,MCS-123,Solar|Heating\n",
    types,
  );

  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.candidates[0]?.domain, "example.com");
  assert.equal(parsed.candidates[0]?.status, "Active");
  assert.deepEqual(parsed.candidates[0]?.customValues, {
    registration_number: ["MCS-123"],
    technologies: ["Solar", "Heating"],
  });
});

test("company import rejects missing required fields", () => {
  const parsed = parseCompanyImportCsv(
    "companyType,name,domain,custom:registration_number\ninstaller-company,Example Ltd,example.com,\ninstaller-company,Example Two,example.com,MCS-2\n",
    types,
  );

  assert.equal(parsed.candidates.length, 1);
  assert.match(parsed.issues[0]?.reason ?? "", /required/i);
});

test("company import rejects repeated domains within one CSV", () => {
  const parsed = parseCompanyImportCsv(
    "companyType,name,domain,custom:registration_number\ninstaller-company,Example Ltd,example.com,MCS-1\ninstaller-company,Example Two,example.com,MCS-2\n",
    types,
  );

  assert.equal(parsed.candidates.length, 1);
  assert.match(parsed.issues[0]?.reason ?? "", /Duplicate company/);
});

test("company import rejects unknown custom fields", () => {
  const parsed = parseCompanyImportCsv(
    "companyType,name,custom:unknown\ninstaller-company,Example Ltd,value\n",
    types,
  );

  assert.equal(parsed.candidates.length, 0);
  assert.match(parsed.issues[0]?.reason ?? "", /Unknown custom field key/);
});

test("company import uses domain first and name as the safe fallback identity", () => {
  assert.equal(
    companyImportIdentity({ domain: "www.example.com", name: "Example Ltd" }),
    "domain:example.com",
  );
  assert.equal(
    companyImportIdentity({ domain: null, name: "  Example   Ltd " }),
    "name:example ltd",
  );
});

test("company import template exposes stable slugs and custom keys", () => {
  const template = companyImportTemplateCsv(types);
  assert.match(template, /custom:registration_number/);
  assert.match(template, /installer-company,Example Ltd/);
});

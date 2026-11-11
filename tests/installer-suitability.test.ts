import assert from "node:assert/strict";
import test from "node:test";
import type { ContactCustomFieldDefinition } from "../src/lib/contacts/custom-fields";
import { installerSuitability } from "../src/lib/sales/installer-suitability";

const definition: ContactCustomFieldDefinition = {
  contactTypeId: "installer-type",
  displayOrder: 1,
  externalEditable: false,
  fieldType: "SHORT_TEXT",
  helpText: null,
  id: "mcs-number",
  isActive: true,
  isSearchable: false,
  key: "mcs_number",
  label: "MCS number",
  options: [],
  placeholder: null,
  requirementMode: "COMPLETENESS",
  showInTable: false,
};

const requirement = {
  contactTypeId: "installer-type",
  description: null,
  displayOrder: 1,
  id: "insurance-requirement",
  isActive: true,
  isRequired: true,
  label: "Public liability insurance",
  uploadType: "insurance_certificate" as const,
};

test("installer suitability passes configured current evidence", () => {
  const result = installerSuitability({
    contactTypeId: "installer-type",
    contactTypeSystemKey: "INSTALLER",
    definitions: [definition],
    documents: [
      {
        documentExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
        documentUploadType: "insurance_certificate",
        id: "document-1",
      },
    ],
    now: new Date("2026-11-11T00:00:00.000Z"),
    requirements: [requirement],
    values: { "mcs-number": "MCS-123" },
  });

  assert.equal(result.status, "ready");
  assert.equal(
    result.checks.every((check) => check.status === "passed"),
    true,
  );
});

test("installer suitability highlights missing fields and expired evidence", () => {
  const result = installerSuitability({
    contactTypeId: "installer-type",
    contactTypeSystemKey: "INSTALLER",
    definitions: [definition],
    documents: [
      {
        documentExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        documentUploadType: "insurance_certificate",
        id: "document-1",
      },
    ],
    now: new Date("2026-11-11T00:00:00.000Z"),
    requirements: [requirement],
    values: {},
  });

  assert.equal(result.status, "attention");
  assert.match(result.checks[1]?.detail ?? "", /MCS number/);
  assert.match(result.checks[2]?.detail ?? "", /Expired/);
});

test("installer suitability does not claim readiness without configuration", () => {
  const result = installerSuitability({
    contactTypeId: "installer-type",
    contactTypeSystemKey: "INSTALLER",
    definitions: [],
    documents: [],
    requirements: [],
    values: {},
  });

  assert.equal(result.status, "not_configured");
});

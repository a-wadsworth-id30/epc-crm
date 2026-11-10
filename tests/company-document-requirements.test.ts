import assert from "node:assert/strict";
import test from "node:test";
import {
  companyDocumentRequirementStatuses,
  parseCompanyDocumentUploadType,
  type CompanyDocumentRequirementDefinition,
} from "../src/lib/companies/document-requirements";

function requirement(
  overrides: Partial<CompanyDocumentRequirementDefinition> = {},
): CompanyDocumentRequirementDefinition {
  return {
    companyTypeId: "installer-company",
    description: null,
    displayOrder: 10,
    id: "insurance",
    isActive: true,
    isRequired: true,
    label: "Public liability insurance",
    uploadType: "insurance_certificate",
    ...overrides,
  };
}

test("company requirements match controlled documents for the selected Company Type", () => {
  const statuses = companyDocumentRequirementStatuses({
    companyTypeId: "installer-company",
    documents: [
      { id: "file-1", documentUploadType: "insurance_certificate" },
      { id: "file-2", documentUploadType: "company_registration" },
    ],
    requirements: [requirement()],
  });

  assert.equal(statuses[0]?.satisfied, true);
  assert.equal(statuses[0]?.matchingDocumentCount, 1);
  assert.deepEqual(statuses[0]?.matchingDocumentIds, ["file-1"]);
});

test("company requirements remain scoped by type and active state", () => {
  const statuses = companyDocumentRequirementStatuses({
    companyTypeId: "supplier",
    documents: [],
    requirements: [
      requirement(),
      requirement({
        companyTypeId: "supplier",
        id: "registration",
        uploadType: "company_registration",
      }),
      requirement({
        companyTypeId: "supplier",
        id: "archived",
        isActive: false,
      }),
    ],
  });

  assert.deepEqual(statuses.map((status) => status.id), ["registration"]);
  assert.equal(statuses[0]?.satisfied, false);
});

test("company document requirements only accept controlled upload types", () => {
  assert.equal(
    parseCompanyDocumentUploadType("company_registration"),
    "company_registration",
  );
  assert.equal(parseCompanyDocumentUploadType("arbitrary-upload"), null);
});

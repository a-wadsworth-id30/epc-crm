import assert from "node:assert/strict";
import test from "node:test";
import {
  contactDocumentRequirementStatuses,
  parseContactDocumentUploadType,
  suggestedContactCustomerUploadTypes,
  type ContactDocumentRequirementDefinition,
} from "../src/lib/contacts/document-requirements";

function requirement(
  overrides: Partial<ContactDocumentRequirementDefinition> = {},
): ContactDocumentRequirementDefinition {
  return {
    contactTypeId: "installer",
    description: null,
    displayOrder: 10,
    id: "driving-licence",
    isActive: true,
    isRequired: true,
    label: "Driving licence",
    uploadType: "driving_licence",
    ...overrides,
  };
}

test("contact document requirements match exact controlled document metadata", () => {
  const statuses = contactDocumentRequirementStatuses({
    contactTypeId: "installer",
    documents: [
      { id: "file-1", documentUploadType: "driving_licence" },
      { id: "file-2", documentUploadType: "driving_licence" },
      { id: "file-3", documentUploadType: "identity_document" },
      { id: "legacy", documentUploadType: null },
    ],
    requirements: [requirement()],
  });

  assert.equal(statuses[0]?.satisfied, true);
  assert.equal(statuses[0]?.matchingDocumentCount, 2);
  assert.deepEqual(statuses[0]?.matchingDocumentIds, ["file-1", "file-2"]);
});

test("requirements remain scoped to the current person type and active state", () => {
  const statuses = contactDocumentRequirementStatuses({
    contactTypeId: "consumer",
    documents: [{ id: "file", documentUploadType: "driving_licence" }],
    requirements: [
      requirement(),
      requirement({ id: "consumer-id", contactTypeId: "consumer", uploadType: "identity_document" }),
      requirement({ id: "archived", contactTypeId: "consumer", isActive: false }),
    ],
  });

  assert.deepEqual(statuses.map((status) => status.id), ["consumer-id"]);
  assert.equal(statuses[0]?.satisfied, false);
});

test("controlled contact document types include installer identity evidence", () => {
  assert.equal(parseContactDocumentUploadType("driving_licence"), "driving_licence");
  assert.equal(parseContactDocumentUploadType("accreditation_certificate"), "accreditation_certificate");
  assert.equal(parseContactDocumentUploadType("arbitrary-upload"), null);
});

test("external upload suggestions include only missing required customer-safe types", () => {
  assert.deepEqual(
    suggestedContactCustomerUploadTypes([
      { isRequired: true, satisfied: false, uploadType: "driving_licence" },
      { isRequired: true, satisfied: true, uploadType: "identity_document" },
      { isRequired: false, satisfied: false, uploadType: "insurance_certificate" },
      { isRequired: true, satisfied: false, uploadType: "contract" },
      { isRequired: true, satisfied: false, uploadType: "not-controlled" },
    ]),
    ["driving_licence"],
  );
});

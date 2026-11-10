import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";

export type ContactDocumentRequirementDefinition = {
  contactTypeId: string;
  description: string | null;
  displayOrder: number;
  id: string;
  isActive: boolean;
  isRequired: boolean;
  label: string;
  uploadType: DocumentUploadType;
};

export type ContactRequirementDocument = {
  documentUploadType: string | null;
  id: string;
};

export type ContactDocumentRequirementStatus =
  ContactDocumentRequirementDefinition & {
    matchingDocumentCount: number;
    matchingDocumentIds: string[];
    satisfied: boolean;
  };

export function contactDocumentRequirementDefaultLabel(uploadType: DocumentUploadType) {
  return documentUploadTypeDefinition(uploadType)?.label ?? uploadType;
}

export function contactDocumentRequirementStatuses({
  contactTypeId,
  documents,
  requirements,
}: {
  contactTypeId: string | null;
  documents: ContactRequirementDocument[];
  requirements: ContactDocumentRequirementDefinition[];
}) {
  if (!contactTypeId) return [];

  return requirements
    .filter(
      (requirement) =>
        requirement.isActive && requirement.contactTypeId === contactTypeId,
    )
    .map((requirement): ContactDocumentRequirementStatus => {
      const matchingDocumentIds = documents
        .filter(
          (document) => document.documentUploadType === requirement.uploadType,
        )
        .map((document) => document.id);

      return {
        ...requirement,
        matchingDocumentCount: matchingDocumentIds.length,
        matchingDocumentIds,
        satisfied: matchingDocumentIds.length > 0,
      };
    });
}

export function parseContactDocumentUploadType(value: unknown) {
  return isDocumentUploadType(value) ? value : null;
}

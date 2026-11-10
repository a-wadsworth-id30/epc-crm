import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";

export type CompanyDocumentRequirementDefinition = {
  companyTypeId: string;
  description: string | null;
  displayOrder: number;
  id: string;
  isActive: boolean;
  isRequired: boolean;
  label: string;
  uploadType: DocumentUploadType;
};

export type CompanyRequirementDocument = {
  documentUploadType: string | null;
  id: string;
};

export type CompanyDocumentRequirementStatus =
  CompanyDocumentRequirementDefinition & {
    matchingDocumentCount: number;
    matchingDocumentIds: string[];
    satisfied: boolean;
  };

export function companyDocumentRequirementDefaultLabel(
  uploadType: DocumentUploadType,
) {
  return documentUploadTypeDefinition(uploadType)?.label ?? uploadType;
}

export function companyDocumentRequirementStatuses({
  companyTypeId,
  documents,
  requirements,
}: {
  companyTypeId: string | null;
  documents: CompanyRequirementDocument[];
  requirements: CompanyDocumentRequirementDefinition[];
}) {
  if (!companyTypeId) return [];

  return requirements
    .filter(
      (requirement) =>
        requirement.isActive && requirement.companyTypeId === companyTypeId,
    )
    .map((requirement): CompanyDocumentRequirementStatus => {
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

export function parseCompanyDocumentUploadType(value: unknown) {
  return isDocumentUploadType(value) ? value : null;
}

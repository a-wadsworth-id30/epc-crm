import type {
  ContactCustomFieldDefinition,
  ContactCustomFieldFormValue,
} from "@/lib/contacts/custom-fields";
import {
  contactDocumentRequirementStatuses,
  type ContactDocumentRequirementDefinition,
} from "@/lib/contacts/document-requirements";
import { contactProfileCompleteness } from "@/lib/contacts/profile-completeness";

export type InstallerSuitabilityCheck = {
  detail: string;
  label: string;
  status: "attention" | "not_configured" | "passed";
};

export type InstallerSuitability = {
  checks: InstallerSuitabilityCheck[];
  status: "attention" | "not_configured" | "ready";
};

export function installerSuitability({
  contactTypeId,
  contactTypeSystemKey,
  definitions,
  documents,
  now = new Date(),
  requirements,
  values,
}: {
  contactTypeId: string | null;
  contactTypeSystemKey: string | null;
  definitions: ContactCustomFieldDefinition[];
  documents: Array<{
    documentExpiresAt: Date | null;
    documentUploadType: string | null;
    id: string;
  }>;
  now?: Date;
  requirements: ContactDocumentRequirementDefinition[];
  values: Record<string, ContactCustomFieldFormValue>;
}): InstallerSuitability {
  const isInstallerType = contactTypeSystemKey === "INSTALLER";
  const profile = contactProfileCompleteness({
    contactTypeId,
    definitions,
    values,
  });
  const requiredDocumentStatuses = contactDocumentRequirementStatuses({
    contactTypeId,
    documents,
    requirements,
  }).filter((requirement) => requirement.isRequired);
  const documentsById = new Map(
    documents.map((document) => [document.id, document]),
  );
  const missingDocuments: string[] = [];
  const expiredDocuments: string[] = [];

  for (const requirement of requiredDocumentStatuses) {
    const matching = requirement.matchingDocumentIds
      .map((id) => documentsById.get(id))
      .filter((document): document is NonNullable<typeof document> =>
        Boolean(document),
      );
    if (!matching.length) {
      missingDocuments.push(requirement.label);
      continue;
    }
    const hasCurrentDocument = matching.some(
      (document) =>
        !document.documentExpiresAt || document.documentExpiresAt >= now,
    );
    if (!hasCurrentDocument) expiredDocuments.push(requirement.label);
  }

  const checks: InstallerSuitabilityCheck[] = [
    {
      detail: isInstallerType
        ? "Person is classified with the Installer system type."
        : "Assign the Installer Person Type before treating this participant as verified.",
      label: "Person Type",
      status: isInstallerType ? "passed" : "attention",
    },
    profile.isConfigured
      ? {
          detail: profile.isComplete
            ? `All ${profile.total} visible profile requirement${profile.total === 1 ? " is" : "s are"} complete.`
            : `Missing: ${profile.missing.map((field) => field.label).join(", ")}.`,
          label: "Profile requirements",
          status: profile.isComplete ? "passed" : "attention",
        }
      : {
          detail:
            "No visible completeness fields are configured for this Person Type.",
          label: "Profile requirements",
          status: "not_configured",
        },
    requiredDocumentStatuses.length
      ? {
          detail:
            missingDocuments.length || expiredDocuments.length
              ? [
                  missingDocuments.length
                    ? `Missing: ${missingDocuments.join(", ")}.`
                    : null,
                  expiredDocuments.length
                    ? `Expired: ${expiredDocuments.join(", ")}.`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")
              : `All ${requiredDocumentStatuses.length} required document${requiredDocumentStatuses.length === 1 ? " is" : "s are"} present and in date.`,
          label: "Required documents",
          status:
            missingDocuments.length || expiredDocuments.length
              ? "attention"
              : "passed",
        }
      : {
          detail: "No required documents are configured for this Person Type.",
          label: "Required documents",
          status: "not_configured",
        },
  ];
  const hasAttention = checks.some((check) => check.status === "attention");
  const hasConfiguredEvidence = checks.some(
    (check) =>
      check.label !== "Person Type" && check.status !== "not_configured",
  );

  return {
    checks,
    status: hasAttention
      ? "attention"
      : hasConfiguredEvidence
        ? "ready"
        : "not_configured",
  };
}

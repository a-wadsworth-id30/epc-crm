import type { Prisma } from "@prisma/client";
import {
  parseContactCustomFieldSubmission,
  serializeContactCustomFieldValue,
  type ContactCustomFieldDefinition,
  type ContactCustomFieldFormValue,
  type ContactCustomFieldStoredValue,
  type ContactCustomFieldSubmissionResult,
  type ContactCustomFieldWrite,
} from "@/lib/contacts/custom-fields";

export type CompanyCustomFieldDefinition = Omit<
  ContactCustomFieldDefinition,
  "contactTypeId"
> & {
  companyTypeId: string;
};

export type CompanyCustomFieldFormValue = ContactCustomFieldFormValue;
export type CompanyCustomFieldStoredValue = ContactCustomFieldStoredValue;

export function parseCompanyCustomFieldSubmission(
  definitions: CompanyCustomFieldDefinition[],
  formData: FormData,
): ContactCustomFieldSubmissionResult {
  return parseContactCustomFieldSubmission(
    definitions.map(({ companyTypeId, ...definition }) => ({
      ...definition,
      contactTypeId: companyTypeId,
    })),
    formData,
  );
}

export function serializeCompanyCustomFieldValue(
  value: CompanyCustomFieldStoredValue,
) {
  return serializeContactCustomFieldValue(value);
}

export async function replaceCompanyCustomFieldValues(
  tx: Prisma.TransactionClient,
  companyId: string,
  values: ContactCustomFieldWrite[],
) {
  for (const value of values) {
    const data = {
      booleanValue: value.booleanValue,
      dateValue: value.dateValue,
      jsonValue: value.jsonValue,
      numberValue: value.numberValue,
      textValue: value.textValue,
    };
    const hasValue =
      data.booleanValue !== null ||
      data.dateValue !== null ||
      data.numberValue !== null ||
      data.textValue !== null ||
      (Array.isArray(data.jsonValue) && data.jsonValue.length > 0);

    if (!hasValue) {
      await tx.companyCustomFieldValue.deleteMany({
        where: { companyId, fieldId: value.fieldId },
      });
      continue;
    }

    await tx.companyCustomFieldValue.upsert({
      where: { companyId_fieldId: { companyId, fieldId: value.fieldId } },
      create: { ...data, companyId, fieldId: value.fieldId },
      update: data,
    });
  }
}

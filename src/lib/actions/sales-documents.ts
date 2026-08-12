"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { salesOpportunityIdAccessWhere } from "@/lib/crm-resource-access";
import {
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { prisma } from "@/lib/prisma";
import { uploadRecordDocumentFile } from "@/lib/record-document-upload";
import {
  normaliseFileAssetNotes,
  parseFileAssetTags,
} from "@/lib/storage/file-metadata";

export type SaleDocumentActionState = {
  ok: boolean;
  message: string;
};

const uploadSaleDocumentSchema = z.object({
  saleId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  scope: z.enum(["lead", "customer"]).default("lead"),
  documentType: z
    .unknown()
    .optional()
    .transform((value) =>
      isDocumentUploadType(value) ? (value as DocumentUploadType) : null,
    ),
});

function uploadFilesFromFormData(formData: FormData) {
  const files = formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (files.length) return files;

  const legacyFile = formData.get("file");
  return legacyFile instanceof File && legacyFile.size > 0 ? [legacyFile] : [];
}

export async function uploadSaleDocumentAction(
  _: SaleDocumentActionState,
  formData: FormData,
): Promise<SaleDocumentActionState> {
  const user = await requireUser();
  const files = uploadFilesFromFormData(formData);
  const parsed = uploadSaleDocumentSchema.safeParse({
    saleId: formData.get("saleId"),
    contactId: formData.get("contactId"),
    scope: formData.get("scope"),
    documentType: formData.get("documentType"),
  });

  if (!files.length) {
    return { ok: false, message: "Choose at least one document to upload." };
  }

  if (files.length > 20) {
    return { ok: false, message: "Upload 20 files or fewer at once." };
  }

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the upload details.",
    };
  }

  if (!parsed.data.documentType) {
    return { ok: false, message: "Choose a document type." };
  }

  const sale = await prisma.salesOpportunity.findFirst({
    where: salesOpportunityIdAccessWhere(parsed.data.saleId, user),
    select: { id: true, contactId: true },
  });

  if (!sale) {
    return { ok: false, message: "Sale not found." };
  }

  const useCustomerScope = Boolean(
    parsed.data.scope === "customer" &&
      parsed.data.contactId &&
      parsed.data.contactId === sale.contactId,
  );
  const entityId = useCustomerScope ? parsed.data.contactId! : sale.id;
  const entityType = useCustomerScope ? "Contact" : "SalesOpportunity";
  const notes = normaliseFileAssetNotes(formData.get("notes"));
  const tags = parseFileAssetTags(formData.get("tagsText"));
  let uploadedCount = 0;
  const folders = new Set<string>();
  const failures: string[] = [];

  for (const file of files) {
    try {
      const upload = await uploadRecordDocumentFile({
        entityId,
        entityType,
        file,
        notes,
        tags,
        uploadedById: user.id,
        uploadType: parsed.data.documentType,
      });

      uploadedCount += 1;
      folders.add(upload.folderName);
    } catch (error) {
      failures.push(
        `${file.name}: ${
          error instanceof Error ? error.message : "Document upload failed."
        }`,
      );
    }
  }

  if (uploadedCount) {
    revalidatePath(`/sales/${sale.id}`);
  }

  if (failures.length) {
    return {
      ok: false,
      message: uploadedCount
        ? `${uploadedCount} uploaded. ${failures[0]}`
        : failures[0] ?? "Document upload failed.",
    };
  }

  const folderLabel =
    folders.size === 1 ? ` to ${Array.from(folders)[0]}` : "";
  return {
    ok: true,
    message: `${uploadedCount} document${uploadedCount === 1 ? "" : "s"} uploaded${folderLabel}.`,
  };
}

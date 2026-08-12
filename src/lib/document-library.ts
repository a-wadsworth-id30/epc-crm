import { z } from "zod";

export type DocumentLibraryFolder = {
  slug: string;
  name: string;
  sortOrder: number;
};

export type DocumentLibrarySettings = {
  folders: DocumentLibraryFolder[];
};

export type DocumentUploadTypeDefinition = {
  key: string;
  label: string;
  folderSlug: string;
  customerFacing: boolean;
  description: string;
};

export const defaultDocumentLibraryFolders = [
  "Surveys & Site Photos",
  "Property Documents",
  "Floor Plans & Drawings",
  "Utility Bills",
  "Quotations & Proposals",
  "Contracts & Finance",
  "Design Documents",
  "Installation Photos",
  "Commissioning & Handover",
  "Warranties & Certificates",
  "Servicing & Maintenance",
] as const;

export const documentUploadTypeDefinitions = [
  {
    key: "survey",
    label: "Survey",
    folderSlug: "surveys-and-site-photos",
    customerFacing: false,
    description: "Survey notes, survey outputs and site visit evidence.",
  },
  {
    key: "site_photo",
    label: "Site photo",
    folderSlug: "surveys-and-site-photos",
    customerFacing: true,
    description: "Photos uploaded from enquiry forms, email requests or site visits.",
  },
  {
    key: "property_document",
    label: "Property document",
    folderSlug: "property-documents",
    customerFacing: true,
    description: "Ownership, planning, EPC or property-specific documents.",
  },
  {
    key: "floor_plan",
    label: "Floor plan or drawing",
    folderSlug: "floor-plans-and-drawings",
    customerFacing: true,
    description: "Floor plans, drawings, marked-up plans and room layouts.",
  },
  {
    key: "utility_bill",
    label: "Utility bill",
    folderSlug: "utility-bills",
    customerFacing: true,
    description: "Energy bills and other utility evidence requested from customers.",
  },
  {
    key: "quotation",
    label: "Quotation or proposal",
    folderSlug: "quotations-and-proposals",
    customerFacing: false,
    description: "Quotes, estimates and proposal packs produced by the office team.",
  },
  {
    key: "contract",
    label: "Contract or finance",
    folderSlug: "contracts-and-finance",
    customerFacing: false,
    description: "Contracts, signed finance paperwork and payment evidence.",
  },
  {
    key: "design_document",
    label: "Design document",
    folderSlug: "design-documents",
    customerFacing: false,
    description: "Design packs, design revisions and technical specifications.",
  },
  {
    key: "installation_photo",
    label: "Installation photo",
    folderSlug: "installation-photos",
    customerFacing: false,
    description: "Engineer-uploaded photos from installation work.",
  },
  {
    key: "commissioning_handover",
    label: "Commissioning or handover",
    folderSlug: "commissioning-and-handover",
    customerFacing: false,
    description: "Commissioning sheets, handover documents and completion packs.",
  },
  {
    key: "warranty_certificate",
    label: "Warranty or certificate",
    folderSlug: "warranties-and-certificates",
    customerFacing: false,
    description: "Warranties, certificates and compliance evidence.",
  },
  {
    key: "service_maintenance",
    label: "Servicing or maintenance",
    folderSlug: "servicing-and-maintenance",
    customerFacing: false,
    description: "Servicing, maintenance, inspection and repair documents.",
  },
] as const satisfies readonly DocumentUploadTypeDefinition[];

export type DocumentUploadType =
  (typeof documentUploadTypeDefinitions)[number]["key"];

const documentFolderSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/);

const documentFolderSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: documentFolderSlugSchema,
  sortOrder: z.coerce.number().int().min(0).max(500),
});

export const documentLibrarySettingsSchema = z.object({
  folders: z.array(documentFolderSchema).min(1).max(50),
});

const partialDocumentLibrarySettingsSchema = z.object({
  folders: z.array(documentFolderSchema.partial()).optional(),
});

export function documentFolderSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "documents"
  );
}

function uniqueSlug(baseSlug: string, usedSlugs: Set<string>) {
  let slug = baseSlug;
  let index = 2;

  while (usedSlugs.has(slug)) {
    const suffix = `-${index}`;
    slug = `${baseSlug.slice(0, 80 - suffix.length)}${suffix}`;
    index += 1;
  }

  usedSlugs.add(slug);
  return slug;
}

export function normaliseDocumentFolders(
  folders: Array<{ name: string; slug?: string | null }>,
): DocumentLibraryFolder[] {
  const usedSlugs = new Set<string>();

  return folders
    .map((folder) => ({
      name: folder.name.trim().replace(/\s+/g, " "),
      slug: folder.slug?.trim() || "",
    }))
    .filter((folder) => folder.name)
    .slice(0, 50)
    .map((folder, index) => {
      const preferredSlug = documentFolderSlug(folder.slug || folder.name);

      return {
        name: folder.name,
        slug: uniqueSlug(preferredSlug, usedSlugs),
        sortOrder: index,
      };
    });
}

export const defaultDocumentLibrarySettings: DocumentLibrarySettings = {
  folders: normaliseDocumentFolders(
    defaultDocumentLibraryFolders.map((name) => ({ name })),
  ),
};

export function parseDocumentLibrarySettings(
  value: unknown,
): DocumentLibrarySettings {
  const parsed = partialDocumentLibrarySettingsSchema.safeParse(value ?? {});

  if (!parsed.success || !parsed.data.folders?.length) {
    return defaultDocumentLibrarySettings;
  }

  const folders = normaliseDocumentFolders(
    parsed.data.folders.map((folder) => ({
      name: folder.name ?? "",
      slug: folder.slug ?? null,
    })),
  );

  if (!folders.length) {
    return defaultDocumentLibrarySettings;
  }

  return documentLibrarySettingsSchema.parse({ folders });
}

export function documentFolderName(
  folders: readonly DocumentLibraryFolder[],
  slug: string | null,
) {
  if (!slug) return "Unfiled documents";

  return (
    folders.find((folder) => folder.slug === slug)?.name ?? "Unfiled documents"
  );
}

export function isDocumentUploadType(
  value: unknown,
): value is DocumentUploadType {
  return (
    typeof value === "string" &&
    documentUploadTypeDefinitions.some((definition) => definition.key === value)
  );
}

export function documentUploadTypeDefinition(
  type: DocumentUploadType,
) {
  return documentUploadTypeDefinitions.find(
    (definition) => definition.key === type,
  );
}

export function resolveDocumentFolderForUpload({
  folders,
  folderSlug,
  uploadType,
}: {
  folders: readonly DocumentLibraryFolder[];
  folderSlug?: string | null;
  uploadType?: DocumentUploadType | null;
}) {
  if (folderSlug) {
    const explicitFolder = folders.find((folder) => folder.slug === folderSlug);
    return explicitFolder ?? null;
  }

  if (uploadType) {
    const definition = documentUploadTypeDefinition(uploadType);
    const typedFolder = definition
      ? folders.find((folder) => folder.slug === definition.folderSlug)
      : null;

    return typedFolder ?? null;
  }

  return folders[0] ?? null;
}

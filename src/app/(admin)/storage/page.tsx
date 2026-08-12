import { FileAssetVisibility, type Prisma } from "@prisma/client";
import type { Metadata } from "next";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StorageBrowser from "@/components/crm-boilerplate/LazyStorageBrowser";
import { requireAdmin } from "@/lib/auth";
import {
  parseInterfaceDefaults,
  resolveInterfacePageSizeFallback,
} from "@/lib/interface-defaults";
import {
  parsePageSize,
  parsePositiveInteger,
  singleParam,
} from "@/lib/navigation/pagination";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingColumnError } from "@/lib/prisma-errors";
import { getCrmSettings } from "@/lib/settings";
import { mediaAssetUrl } from "@/lib/storage/media";
import { documentFileAssetWhere } from "@/lib/storage/file-filters";
import { getStorageSupportData } from "@/lib/storage/support-data";

export const metadata: Metadata = {
  title: "Storage | iD30 CRM",
};

type StoragePageProps = {
  searchParams?: Promise<{
    direction?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
    q?: string | string[];
    sort?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    folder?: string | string[];
    kind?: string | string[];
    linked?: string | string[];
    uploaderId?: string | string[];
    visibility?: string | string[];
  }>;
};

const storagePageSizes = [10, 25, 50, 100] as const;
const defaultStoragePageSize = 25;
const storageSortKeys = [
  "name",
  "folder",
  "type",
  "size",
  "visibility",
  "uploadedBy",
  "createdAt",
] as const;
type StorageSortKey = (typeof storageSortKeys)[number];
type SortDirection = "asc" | "desc";
type StorageKind = "all" | "image" | "pdf" | "document" | "other";
type StorageLinkedFilter = "all" | "linked" | "unlinked";

function parseSortKey(value: string | string[] | undefined): StorageSortKey {
  const parsed = singleParam(value);
  return parsed && storageSortKeys.includes(parsed as StorageSortKey)
    ? (parsed as StorageSortKey)
    : "createdAt";
}

function parseSortDirection(
  value: string | string[] | undefined,
  sortKey: StorageSortKey,
): SortDirection {
  const parsed = singleParam(value);
  if (parsed === "asc" || parsed === "desc") return parsed;
  return sortKey === "createdAt" ? "desc" : "asc";
}

function contains(term: string) {
  return { contains: term, mode: "insensitive" as const };
}

function singleDate(value: string | string[] | undefined) {
  const parsed = singleParam(value)?.trim();
  return parsed && /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : "";
}

function parseStorageKind(value: string | string[] | undefined): StorageKind {
  const parsed = singleParam(value);
  return parsed === "image" ||
    parsed === "pdf" ||
    parsed === "document" ||
    parsed === "other"
    ? parsed
    : "all";
}

function parseLinkedFilter(
  value: string | string[] | undefined,
): StorageLinkedFilter {
  const parsed = singleParam(value);
  return parsed === "linked" || parsed === "unlinked" ? parsed : "all";
}

function parseVisibility(
  value: string | string[] | undefined,
): FileAssetVisibility | "all" {
  const parsed = singleParam(value);
  return parsed === FileAssetVisibility.PRIVATE ||
    parsed === FileAssetVisibility.PUBLIC
    ? parsed
    : "all";
}

function kindWhere(kind: StorageKind): Prisma.FileAssetWhereInput | null {
  if (kind === "image") return { mimeType: { startsWith: "image/" } };
  if (kind === "pdf") return { mimeType: "application/pdf" };
  if (kind === "document") return documentFileAssetWhere();
  if (kind === "other") {
    return {
      NOT: [{ mimeType: { startsWith: "image/" } }, documentFileAssetWhere()],
    };
  }
  return null;
}

function linkedWhere(
  linked: StorageLinkedFilter,
): Prisma.FileAssetWhereInput | null {
  if (linked === "linked") {
    return {
      OR: [{ entityType: { not: null } }, { entityId: { not: null } }],
    };
  }

  if (linked === "unlinked") {
    return { entityType: null, entityId: null };
  }

  return null;
}

function endOfDate(value: string) {
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function storageWhere({
  dateFrom,
  dateTo,
  documentMetadataSearchEnabled = true,
  folder,
  kind,
  linked,
  query,
  uploaderId,
  visibility,
}: {
  dateFrom: string;
  dateTo: string;
  documentMetadataSearchEnabled?: boolean;
  folder: string;
  kind: StorageKind;
  linked: StorageLinkedFilter;
  query: string;
  uploaderId: string;
  visibility: FileAssetVisibility | "all";
}): Prisma.FileAssetWhereInput | undefined {
  const terms = query.split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const and: Prisma.FileAssetWhereInput[] = [];

  if (terms.length) {
    and.push(
      ...terms.map((term) => {
        const matchingVisibilities = ["PRIVATE", "PUBLIC"].filter(
          (visibility) =>
            visibility.toLowerCase().includes(term.toLowerCase()),
        ) as FileAssetVisibility[];
        const or: Prisma.FileAssetWhereInput[] = [
          { originalName: contains(term) },
          { mimeType: contains(term) },
          { key: contains(term) },
          { bucket: contains(term) },
          { entityType: contains(term) },
          { entityId: contains(term) },
          { uploadedBy: { name: contains(term) } },
          { uploadedBy: { email: contains(term) } },
        ];

        if (documentMetadataSearchEnabled) {
          or.push(
            { documentFolder: contains(term) },
            { notes: contains(term) },
            { tags: { has: term } },
          );
        }

        if (matchingVisibilities.length) {
          or.push({ visibility: { in: matchingVisibilities } });
        }

        return { OR: or };
      }),
    );
  }

  const nextKindWhere = kindWhere(kind);
  const nextLinkedWhere = linkedWhere(linked);
  const fromDate = dateFrom ? startOfDate(dateFrom) : null;
  const toDate = dateTo ? endOfDate(dateTo) : null;

  if (nextKindWhere) and.push(nextKindWhere);
  if (nextLinkedWhere) and.push(nextLinkedWhere);
  if (visibility !== "all") and.push({ visibility });
  if (uploaderId) and.push({ uploadedById: uploaderId });
  if (folder) and.push({ key: { startsWith: `${folder}/` } });
  if (fromDate || toDate) {
    and.push({
      createdAt: {
        ...(fromDate ? { gte: fromDate } : {}),
        ...(toDate ? { lte: toDate } : {}),
      },
    });
  }

  return and.length ? { AND: and } : undefined;
}

function storageOrderBy(
  sortKey: StorageSortKey,
  direction: SortDirection,
): Prisma.FileAssetOrderByWithRelationInput[] {
  switch (sortKey) {
    case "name":
      return [{ originalName: direction }, { createdAt: "desc" }];
    case "folder":
      return [{ key: direction }, { createdAt: "desc" }];
    case "type":
      return [{ mimeType: direction }, { createdAt: "desc" }];
    case "size":
      return [{ sizeBytes: direction }, { createdAt: "desc" }];
    case "visibility":
      return [{ visibility: direction }, { createdAt: "desc" }];
    case "uploadedBy":
      return [
        { uploadedBy: { name: direction } },
        { uploadedBy: { email: direction } },
        { createdAt: "desc" },
      ];
    case "createdAt":
      return [{ createdAt: direction }];
  }
}

function isMissingFileAssetMetadataColumn(error: unknown) {
  return ["documentFolder", "notes", "tags"].some((columnName) =>
    isPrismaMissingColumnError(error, {
      columnName,
      modelName: "FileAsset",
    }),
  );
}

type StorageFileResult = {
  bucket: string;
  createdAt: Date;
  documentFolder: string | null;
  entityId: string | null;
  entityType: string | null;
  id: string;
  key: string;
  mimeType: string;
  notes: string | null;
  originalName: string;
  sizeBytes: number;
  tags: string[];
  updatedAt: Date;
  visibility: FileAssetVisibility;
  uploadedBy: {
    email: string;
    name: string;
  } | null;
};

async function loadStoragePageRows({
  filters,
  pageSize,
  query,
  requestedPage,
  sortDirection,
  sortKey,
}: {
  filters: {
    dateFrom: string;
    dateTo: string;
    folder: string;
    kind: StorageKind;
    linked: StorageLinkedFilter;
    uploaderId: string;
    visibility: FileAssetVisibility | "all";
  };
  pageSize: number;
  query: string;
  requestedPage: number;
  sortDirection: SortDirection;
  sortKey: StorageSortKey;
}): Promise<{ currentPage: number; files: StorageFileResult[]; totalCount: number }> {
  const where = storageWhere({ query, ...filters });

  try {
    const totalCount = await prisma.fileAsset.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const currentPage = Math.min(requestedPage, totalPages);
    const files = await prisma.fileAsset.findMany({
      where,
      orderBy: storageOrderBy(sortKey, sortDirection),
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        bucket: true,
        createdAt: true,
        documentFolder: true,
        entityId: true,
        entityType: true,
        id: true,
        key: true,
        mimeType: true,
        notes: true,
        originalName: true,
        sizeBytes: true,
        tags: true,
        updatedAt: true,
        visibility: true,
        uploadedBy: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return { currentPage, files, totalCount };
  } catch (error) {
    if (!isMissingFileAssetMetadataColumn(error)) {
      throw error;
    }
  }

  const fallbackWhere = storageWhere({
    documentMetadataSearchEnabled: false,
    query,
    ...filters,
  });
  const totalCount = await prisma.fileAsset.count({ where: fallbackWhere });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const files = await prisma.fileAsset.findMany({
    where: fallbackWhere,
    orderBy: storageOrderBy(sortKey, sortDirection),
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      bucket: true,
      createdAt: true,
      entityId: true,
      entityType: true,
      id: true,
      key: true,
      mimeType: true,
      originalName: true,
      sizeBytes: true,
      updatedAt: true,
      visibility: true,
      uploadedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    currentPage,
    files: files.map((file) => ({
      ...file,
      documentFolder: null,
      notes: null,
      tags: [],
    })),
    totalCount,
  };
}

export default async function StoragePage({ searchParams }: StoragePageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const settings = await getCrmSettings();
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const query = (singleParam(params.q) ?? "").trim();
  const filters = {
    dateFrom: singleDate(params.dateFrom),
    dateTo: singleDate(params.dateTo),
    folder: (singleParam(params.folder) ?? "").trim(),
    kind: parseStorageKind(params.kind),
    linked: parseLinkedFilter(params.linked),
    uploaderId: (singleParam(params.uploaderId) ?? "").trim(),
    visibility: parseVisibility(params.visibility),
  };
  const sortKey = parseSortKey(params.sort);
  const sortDirection = parseSortDirection(params.direction, sortKey);
  const requestedPage = parsePositiveInteger(params.page, 1);
  const pageSize = parsePageSize({
    fallback: resolveInterfacePageSizeFallback(
      interfaceDefaults,
      storagePageSizes,
      defaultStoragePageSize,
    ),
    options: storagePageSizes,
    value: params.pageSize,
  });
  const storageSupportData = await getStorageSupportData();
  const { currentPage, files, totalCount } = await loadStoragePageRows({
    filters,
    pageSize,
    query,
    requestedPage,
    sortDirection,
    sortKey,
  });
  const summary = {
    ...storageSupportData.summary,
    filteredFiles: totalCount,
  };

  return (
    <>
      <PageHeader
        title="Storage"
        description="Browse, view, edit and delete files stored through Cloudflare R2."
      />
      <StorageBrowser
        files={files.map((file) => ({
          id: file.id,
          originalName: file.originalName,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          bucket: file.bucket,
          documentFolder: file.documentFolder,
          key: file.key,
          notes: file.notes,
          tags: file.tags,
          visibility: file.visibility,
          entityType: file.entityType,
          entityId: file.entityId,
          uploadedByName: file.uploadedBy?.name ?? null,
          uploadedByEmail: file.uploadedBy?.email ?? null,
          createdAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
          url: mediaAssetUrl(file.id),
        }))}
        allFileCount={storageSupportData.allFileCount}
        filters={filters}
        folderOptions={storageSupportData.folderOptions}
        page={currentPage}
        pageSize={pageSize}
        query={query}
        sortDirection={sortDirection}
        sortKey={sortKey}
        summary={summary}
        totalCount={totalCount}
        uploadPolicy={storageSupportData.uploadPolicy}
        uploaderOptions={storageSupportData.uploaderOptions}
      />
    </>
  );
}

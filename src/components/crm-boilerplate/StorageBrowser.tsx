"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DeferredStorageDeleteModal,
  DeferredStorageEditModal,
  DeferredStorageUploadModal,
} from "@/components/crm-boilerplate/StorageFileModalLoaders";
import FilePreviewButton from "@/components/crm-boilerplate/FilePreviewButton";
import type { StorageUploadPolicy } from "@/components/crm-boilerplate/StorageFileModals";
import {
  CrmDataTable,
  type CrmDataTableColumn,
  type CrmDataTableSortDirection,
} from "@/components/crm-boilerplate/data-table";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import { FilesIcon } from "@/icons";

export type StorageFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  bucket: string;
  key: string;
  notes: string | null;
  tags: string[];
  documentFolder: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  entityType: string | null;
  entityId: string | null;
  uploadedByName: string | null;
  uploadedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
};

type SortKey =
  | "name"
  | "folder"
  | "type"
  | "size"
  | "visibility"
  | "uploadedBy"
  | "createdAt";
type SortDirection = "asc" | "desc";

const pageSizes = [10, 25, 50, 100];

export type StorageFilterState = {
  dateFrom: string;
  dateTo: string;
  folder: string;
  kind: "all" | "image" | "pdf" | "document" | "other";
  linked: "all" | "linked" | "unlinked";
  uploaderId: string;
  visibility: "all" | "PRIVATE" | "PUBLIC";
};

export type StorageFolderOption = {
  label: string;
  value: string;
};

export type StorageSummary = {
  documentFiles: number;
  filteredFiles: number;
  imageFiles: number;
  otherFiles: number;
  privateFiles: number;
  publicFiles: number;
  recentFiles: number;
  totalBytes: number;
  totalFiles: number;
};

export type StorageUploaderOption = {
  email: string;
  id: string;
  name: string;
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fileFolder(key: string) {
  const parts = key.split("/");
  parts.pop();
  return parts.join("/") || "Root";
}

function isImage(file: StorageFileRow) {
  return file.mimeType.startsWith("image/");
}

function linkedRecordLabel(file: StorageFileRow) {
  if (!file.entityType && !file.entityId) return "Unlinked";
  return [file.entityType, file.entityId, file.documentFolder]
    .filter(Boolean)
    .join(" · ");
}

function activeFilterCount(filters: StorageFilterState) {
  return [
    filters.dateFrom,
    filters.dateTo,
    filters.folder,
    filters.uploaderId,
    filters.kind !== "all" ? filters.kind : "",
    filters.linked !== "all" ? filters.linked : "",
    filters.visibility !== "all" ? filters.visibility : "",
  ].filter(Boolean).length;
}

function SummaryCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </div>
  );
}

const filterSelectClass =
  "h-11 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-700 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300";

export default function StorageBrowser({
  allFileCount,
  filters,
  files,
  folderOptions,
  page,
  pageSize,
  query,
  sortDirection,
  sortKey,
  summary,
  totalCount,
  uploadPolicy,
  uploaderOptions,
}: {
  allFileCount: number;
  filters: StorageFilterState;
  files: StorageFileRow[];
  folderOptions: StorageFolderOption[];
  page: number;
  pageSize: number;
  query: string;
  sortDirection: SortDirection;
  sortKey: SortKey;
  summary: StorageSummary;
  totalCount: number;
  uploadPolicy: StorageUploadPolicy;
  uploaderOptions: StorageUploaderOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localQuery, setLocalQuery] = useState(query);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      const nextUrl = params.toString() ? `${pathname}?${params}` : pathname;
      router.push(nextUrl);
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    if (localQuery === query) return;

    const timer = window.setTimeout(() => {
      updateParams({ page: null, q: localQuery.trim() || null });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [localQuery, query, updateParams]);

  if (!allFileCount) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No files yet"
          description="CRM uploads will appear here once workflows store media in R2."
        />
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DeferredStorageUploadModal uploadPolicy={uploadPolicy} />
          <Link
            href="/settings/integrations/cloudflare-r2"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Check R2 setup
          </Link>
        </div>
      </div>
    );
  }

  const filterCount = activeFilterCount(filters);
  const columns: CrmDataTableColumn<StorageFileRow>[] = [
    {
      id: "name",
      header: "File",
      sortable: true,
      sortValue: (file) => file.originalName,
      cell: (file) => (
        <div className="flex min-w-[260px] items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 bg-cover bg-center text-gray-500 dark:bg-white/10 dark:text-gray-400"
            style={
              isImage(file) ? { backgroundImage: `url(${file.url})` } : undefined
            }
            aria-label={`${file.originalName} preview`}
          >
            {!isImage(file) && <FilesIcon className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-800 dark:text-white/90">
              {file.originalName}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {file.visibility.toLowerCase()} · uploaded {formatDate(file.createdAt)} by{" "}
              {file.uploadedByName ?? file.uploadedByEmail ?? "Unknown uploader"}
            </p>
            {file.tags.length ? (
              <div className="mt-1 flex max-w-[360px] flex-wrap gap-1">
                {file.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
                {file.tags.length > 3 ? (
                  <span className="text-[11px] font-semibold text-gray-400">
                    +{file.tags.length - 3}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ),
    },
    {
      id: "folder",
      header: "Folder",
      sortable: true,
      sortValue: (file) => file.key,
      cell: (file) => (
        <span className="block max-w-[220px] truncate text-xs">
          {fileFolder(file.key)}
        </span>
      ),
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      sortValue: (file) => file.mimeType,
      cell: (file) => file.mimeType,
    },
    {
      id: "size",
      header: "Size",
      sortable: true,
      sortValue: (file) => file.sizeBytes,
      cell: (file) => formatBytes(file.sizeBytes),
    },
    {
      id: "linked",
      header: "Linked record",
      cell: (file) => (
        <span className="block max-w-[220px] truncate text-gray-600 dark:text-gray-300">
          {linkedRecordLabel(file)}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Uploaded",
      sortable: true,
      sortValue: (file) => file.createdAt,
      cell: (file) => formatDate(file.createdAt),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Files"
          value={summary.totalFiles.toLocaleString("en-GB")}
          detail={`${summary.filteredFiles.toLocaleString("en-GB")} in current view`}
        />
        <SummaryCard
          label="Storage used"
          value={formatBytes(summary.totalBytes)}
          detail={`${summary.recentFiles.toLocaleString("en-GB")} uploaded in 7 days`}
        />
        <SummaryCard
          label="Visibility"
          value={`${summary.privateFiles.toLocaleString("en-GB")} private`}
          detail={`${summary.publicFiles.toLocaleString("en-GB")} public files`}
        />
        <SummaryCard
          label="File mix"
          value={`${summary.imageFiles.toLocaleString("en-GB")} images`}
          detail={`${summary.documentFiles.toLocaleString("en-GB")} documents · ${summary.otherFiles.toLocaleString("en-GB")} other`}
        />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Storage controls
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Upload files and narrow the browser by file type, owner, date or
              R2 folder.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {filterCount ? (
              <button
                type="button"
                onClick={() =>
                  updateParams({
                    dateFrom: null,
                    dateTo: null,
                    folder: null,
                    kind: null,
                    linked: null,
                    page: null,
                    uploaderId: null,
                    visibility: null,
                  })
                }
                className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                Clear filters ({filterCount})
              </button>
            ) : null}
            <DeferredStorageUploadModal uploadPolicy={uploadPolicy} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Type
            <select
              value={filters.kind}
              onChange={(event) =>
                updateParams({
                  kind: event.target.value === "all" ? null : event.target.value,
                  page: null,
                })
              }
              className={`mt-1.5 ${filterSelectClass}`}
            >
              <option value="all">All types</option>
              <option value="image">Images</option>
              <option value="pdf">PDFs</option>
              <option value="document">Documents</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Visibility
            <select
              value={filters.visibility}
              onChange={(event) =>
                updateParams({
                  page: null,
                  visibility:
                    event.target.value === "all" ? null : event.target.value,
                })
              }
              className={`mt-1.5 ${filterSelectClass}`}
            >
              <option value="all">All visibility</option>
              <option value="PRIVATE">Private</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Link status
            <select
              value={filters.linked}
              onChange={(event) =>
                updateParams({
                  linked:
                    event.target.value === "all" ? null : event.target.value,
                  page: null,
                })
              }
              className={`mt-1.5 ${filterSelectClass}`}
            >
              <option value="all">All files</option>
              <option value="linked">Linked</option>
              <option value="unlinked">Unlinked</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Uploader
            <select
              value={filters.uploaderId}
              onChange={(event) =>
                updateParams({
                  page: null,
                  uploaderId: event.target.value || null,
                })
              }
              className={`mt-1.5 ${filterSelectClass}`}
            >
              <option value="">All uploaders</option>
              {uploaderOptions.map((uploader) => (
                <option key={uploader.id} value={uploader.id}>
                  {uploader.name || uploader.email}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            R2 folder
            <select
              value={filters.folder}
              onChange={(event) =>
                updateParams({
                  folder: event.target.value || null,
                  page: null,
                })
              }
              className={`mt-1.5 ${filterSelectClass}`}
            >
              <option value="">All folders</option>
              {folderOptions.map((folder) => (
                <option key={folder.value} value={folder.value}>
                  {folder.label}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              From
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(event) =>
                  updateParams({ dateFrom: event.target.value || null, page: null })
                }
                className={`mt-1.5 ${filterSelectClass}`}
              />
            </label>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              To
              <input
                type="date"
                value={filters.dateTo}
                onChange={(event) =>
                  updateParams({ dateTo: event.target.value || null, page: null })
                }
                className={`mt-1.5 ${filterSelectClass}`}
              />
            </label>
          </div>
        </div>
      </section>

      <CrmDataTable
        data={files}
        columns={columns}
        getRowId={(file) => file.id}
        searchPlaceholder="Search files..."
        query={localQuery}
        onQueryChange={setLocalQuery}
        sort={{ columnId: sortKey, direction: sortDirection }}
        onSortChange={(nextSort) => {
          const nextKey = nextSort.columnId as SortKey;
          const nextDirection = nextSort.direction as CrmDataTableSortDirection;
          const isDefault = nextKey === "createdAt" && nextDirection === "desc";

          updateParams({
            direction: isDefault ? null : nextDirection,
            page: null,
            sort: isDefault ? null : nextKey,
          });
        }}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={(nextPage) =>
          updateParams({ page: nextPage > 1 ? String(nextPage) : null })
        }
        onPageSizeChange={(nextPageSize) =>
          updateParams({ page: null, pageSize: String(nextPageSize) })
        }
        pageSizeOptions={pageSizes}
        manualFiltering
        manualPagination
        manualSorting
        emptyState="No files match this search."
        renderRowActions={(file) => (
          <>
            <FilePreviewButton
              file={{
                createdAt: formatDate(file.createdAt),
                mimeType: file.mimeType,
                name: file.originalName,
                notes: file.notes,
                sizeLabel: formatBytes(file.sizeBytes),
                tags: file.tags,
                uploadedBy:
                  file.uploadedByName ?? file.uploadedByEmail ?? "Unknown uploader",
                url: file.url,
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
            />
            <DeferredStorageEditModal file={file} />
            <DeferredStorageDeleteModal file={file} />
          </>
        )}
      />
    </div>
  );
}

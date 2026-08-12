"use client";

import dynamic from "next/dynamic";
import type {
  StorageFileRow,
  StorageFilterState,
  StorageFolderOption,
  StorageSummary,
  StorageUploaderOption,
} from "@/components/crm-boilerplate/StorageBrowser";
import type { StorageUploadPolicy } from "@/components/crm-boilerplate/StorageFileModals";

type StorageBrowserProps = {
  allFileCount: number;
  files: StorageFileRow[];
  filters: StorageFilterState;
  folderOptions: StorageFolderOption[];
  page: number;
  pageSize: number;
  query: string;
  sortDirection: "asc" | "desc";
  sortKey:
    | "name"
    | "folder"
    | "type"
    | "size"
    | "visibility"
    | "uploadedBy"
    | "createdAt";
  summary: StorageSummary;
  totalCount: number;
  uploadPolicy: StorageUploadPolicy;
  uploaderOptions: StorageUploaderOption[];
};

function StorageBrowserLoading() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["files", "used", "visibility", "mix"].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
          >
            <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-3 h-7 w-24 rounded bg-gray-50 dark:bg-white/[0.05]" />
            <div className="mt-2 h-3 w-40 rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 lg:flex-row lg:items-center lg:justify-between dark:border-gray-800">
          <div>
            <div className="h-5 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
            <div className="mt-3 h-4 w-full max-w-md rounded bg-gray-50 dark:bg-white/[0.05]" />
          </div>
          <div className="h-11 w-28 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          {["type", "visibility", "linked", "uploader", "folder", "date"].map(
            (item) => (
              <div key={item}>
                <div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-11 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ),
          )}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
          {["one", "two", "three", "four"].map((item) => (
            <div key={item} className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-44 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-3 w-36 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-3 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden max-w-full min-w-0 overflow-x-auto lg:block">
          <div className="min-w-[960px] divide-y divide-gray-100 dark:divide-gray-800">
            <div className="grid grid-cols-[1.5fr_1fr_1.1fr_0.7fr_1.1fr_1fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
              {["File", "Folder", "Type", "Size", "Linked", "Uploaded"].map(
                (item) => (
                  <div
                    key={item}
                    className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]"
                  >
                    <span className="sr-only">{item}</span>
                  </div>
                ),
              )}
            </div>
            {["one", "two", "three", "four"].map((item) => (
              <div
                key={item}
                className="grid grid-cols-[1.5fr_1fr_1.1fr_0.7fr_1.1fr_1fr] gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                  <div>
                    <div className="h-4 w-44 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="mt-2 h-3 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                </div>
                <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-36 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-16 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-4 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const StorageBrowser = dynamic<StorageBrowserProps>(
  () => import("@/components/crm-boilerplate/StorageBrowser"),
  {
    loading: StorageBrowserLoading,
    ssr: false,
  },
);

export default function LazyStorageBrowser(props: StorageBrowserProps) {
  return <StorageBrowser {...props} />;
}

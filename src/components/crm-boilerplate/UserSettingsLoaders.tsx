"use client";

import dynamic from "next/dynamic";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import PlusIcon from "@/icons/plus.svg";
import type { UserCreateModalProps } from "@/components/crm-boilerplate/UserCreateModal";

const LoadedUserCreateModal = dynamic<UserCreateModalProps>(
  () =>
    import("@/components/crm-boilerplate/UserCreateModal").then(
      (module) => module.default,
    ),
  {
    ssr: false,
    loading: () => (
      <AddUserTrigger
        disabled
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedUserBulkImportPanel = dynamic(
  () => import("@/components/crm-boilerplate/UserBulkImportPanel"),
  {
    ssr: false,
    loading: () => <BulkImportShell loading onOpen={() => undefined} />,
  },
);

export function DeferredUserCreateModal(props: UserCreateModalProps = {}) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <AddUserTrigger label="Add user" onOpen={open} />
      )}
    >
      {(autoOpen) => <LoadedUserCreateModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredUserBulkImportPanel() {
  return (
    <DeferredActionLoader renderTrigger={(open) => <BulkImportShell onOpen={open} />}>
      {() => <LoadedUserBulkImportPanel />}
    </DeferredActionLoader>
  );
}

function AddUserTrigger({
  disabled = false,
  label,
  onOpen,
}: {
  disabled?: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onOpen}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-brand-300 disabled:opacity-50"
    >
      <PlusIcon className="size-4" />
      {label}
    </button>
  );
}

function BulkImportShell({
  loading = false,
  onOpen,
}: {
  loading?: boolean;
  onOpen: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Bulk user import
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Upload a CSV to create user accounts in bulk. Passwords are not
            imported; each user receives a secure setup link.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          {loading ? "Loading import tool..." : "Open import tool"}
        </button>
      </div>
    </section>
  );
}

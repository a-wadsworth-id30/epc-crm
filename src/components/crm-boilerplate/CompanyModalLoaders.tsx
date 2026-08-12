"use client";

import dynamic from "next/dynamic";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import EditIcon from "@/icons/edit.svg";
import PlusIcon from "@/icons/plus.svg";
import TrashBinIcon from "@/icons/trash.svg";
import type {
  CompanyCreateModalProps,
  CompanyDeleteModalProps,
  CompanyEditModalProps,
} from "@/components/crm-boilerplate/CompanyModals";

const LoadedCompanyCreateModal = dynamic<CompanyCreateModalProps>(
  () =>
    import("@/components/crm-boilerplate/CompanyModals").then(
      (module) => module.CompanyCreateModal,
    ),
  {
    ssr: false,
    loading: () => (
      <CompanyPrimaryTrigger
        disabled
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedCompanyEditModal = dynamic<CompanyEditModalProps>(
  () =>
    import("@/components/crm-boilerplate/CompanyModals").then(
      (module) => module.CompanyEditModal,
    ),
  {
    ssr: false,
    loading: () => (
      <CompanyIconTrigger
        ariaLabel="Loading company edit action"
        disabled
        icon="edit"
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedCompanyDeleteModal = dynamic<CompanyDeleteModalProps>(
  () =>
    import("@/components/crm-boilerplate/CompanyModals").then(
      (module) => module.CompanyDeleteModal,
    ),
  {
    ssr: false,
    loading: () => (
      <CompanyIconTrigger
        ariaLabel="Loading company delete action"
        disabled
        icon="delete"
        onOpen={() => undefined}
        tone="danger"
      />
    ),
  },
);

export function DeferredCompanyCreateModal(props: CompanyCreateModalProps = {}) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <CompanyPrimaryTrigger
          label="Add company"
          onOpen={open}
        />
      )}
    >
      {(autoOpen) => <LoadedCompanyCreateModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredCompanyEditModal(props: CompanyEditModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <CompanyIconTrigger
          ariaLabel={`Edit ${props.company.name ?? "company"}`}
          icon="edit"
          onOpen={open}
        />
      )}
    >
      {(autoOpen) => <LoadedCompanyEditModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredCompanyDeleteModal(props: CompanyDeleteModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <CompanyIconTrigger
          ariaLabel={`Delete ${props.companyName}`}
          icon="delete"
          onOpen={open}
          tone="danger"
        />
      )}
    >
      {(autoOpen) => <LoadedCompanyDeleteModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

function CompanyPrimaryTrigger({
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

function CompanyIconTrigger({
  ariaLabel,
  disabled = false,
  icon,
  onOpen,
  tone = "neutral",
}: {
  ariaLabel: string;
  disabled?: boolean;
  icon: "delete" | "edit";
  onOpen: () => void;
  tone?: "danger" | "neutral";
}) {
  const Icon = icon === "delete" ? TrashBinIcon : EditIcon;
  const className =
    tone === "danger"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error-300 text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:hover:bg-error-900/20"
      : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      <Icon className="size-4" />
    </button>
  );
}

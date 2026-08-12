"use client";

import dynamic from "next/dynamic";
import { GitMerge } from "lucide-react";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import EditIcon from "@/icons/edit.svg";
import PlusIcon from "@/icons/plus.svg";
import TrashBinIcon from "@/icons/trash.svg";
import type {
  ContactCreateModalProps,
  ContactDeleteModalProps,
  ContactEditModalProps,
  ContactMergeModalProps,
} from "@/components/crm-boilerplate/ContactModals";

const LoadedContactCreateModal = dynamic<ContactCreateModalProps>(
  () =>
    import("@/components/crm-boilerplate/ContactModals").then(
      (module) => module.ContactCreateModal,
    ),
  {
    ssr: false,
    loading: () => (
      <ContactPrimaryTrigger
        disabled
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedContactEditModal = dynamic<ContactEditModalProps>(
  () =>
    import("@/components/crm-boilerplate/ContactModals").then(
      (module) => module.ContactEditModal,
    ),
  {
    ssr: false,
    loading: () => (
      <ContactIconTrigger
        ariaLabel="Loading contact edit action"
        disabled
        icon="edit"
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedContactDeleteModal = dynamic<ContactDeleteModalProps>(
  () =>
    import("@/components/crm-boilerplate/ContactModals").then(
      (module) => module.ContactDeleteModal,
    ),
  {
    ssr: false,
    loading: () => (
      <ContactIconTrigger
        ariaLabel="Loading contact delete action"
        disabled
        icon="delete"
        onOpen={() => undefined}
        tone="danger"
      />
    ),
  },
);

const LoadedContactMergeModal = dynamic<ContactMergeModalProps>(
  () =>
    import("@/components/crm-boilerplate/ContactModals").then(
      (module) => module.ContactMergeModal,
    ),
  {
    ssr: false,
    loading: () => (
      <ContactTextTrigger
        disabled
        icon="merge"
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

export function DeferredContactCreateModal(props: ContactCreateModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <ContactPrimaryTrigger
          label="Add contact"
          onOpen={open}
        />
      )}
    >
      {(autoOpen) => <LoadedContactCreateModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredContactEditModal(props: ContactEditModalProps) {
  const contactName = [props.contact.firstName, props.contact.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        props.triggerLabel ? (
          <ContactTextTrigger
            icon="edit"
            label={props.triggerLabel}
            onOpen={open}
          />
        ) : (
          <ContactIconTrigger
            ariaLabel={`Edit ${contactName || "contact"}`}
            icon="edit"
            onOpen={open}
          />
        )
      )}
    >
      {(autoOpen) => <LoadedContactEditModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredContactDeleteModal(props: ContactDeleteModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        props.triggerLabel ? (
          <ContactTextTrigger
            icon="delete"
            label={props.triggerLabel}
            onOpen={open}
            tone="danger"
          />
        ) : (
          <ContactIconTrigger
            ariaLabel={`Delete ${props.contactName}`}
            icon="delete"
            onOpen={open}
            tone="danger"
          />
        )
      )}
    >
      {(autoOpen) => <LoadedContactDeleteModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredContactMergeModal(props: ContactMergeModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <ContactTextTrigger
          icon="merge"
          label={props.triggerLabel ?? "Merge"}
          onOpen={open}
        />
      )}
    >
      {(autoOpen) => <LoadedContactMergeModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

function ContactPrimaryTrigger({
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

function ContactIconTrigger({
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

function ContactTextTrigger({
  disabled = false,
  icon,
  label,
  onOpen,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: "delete" | "edit" | "merge";
  label: string;
  onOpen: () => void;
  tone?: "danger" | "neutral";
}) {
  const className =
    tone === "danger"
      ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-error-300 bg-white px-3 text-sm font-medium text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:bg-gray-900 dark:hover:bg-error-900/20"
      : "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={className}
    >
      {icon === "delete" ? <TrashBinIcon className="size-4" /> : null}
      {icon === "edit" ? <EditIcon className="size-4" /> : null}
      {icon === "merge" ? <GitMerge className="size-4" /> : null}
      {label}
    </button>
  );
}

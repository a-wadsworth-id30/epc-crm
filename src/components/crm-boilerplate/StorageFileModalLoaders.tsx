"use client";

import dynamic from "next/dynamic";
import DeferredActionLoader from "@/components/crm-boilerplate/DeferredActionLoader";
import {
  DeferredIconTrigger,
  DeferredSolidTrigger,
} from "@/components/crm-boilerplate/DeferredModalTriggers";
import { EditIcon, TrashBinIcon } from "@/icons";
import type {
  StorageDeleteModalProps,
  StorageEditModalProps,
  StorageUploadModalProps,
} from "@/components/crm-boilerplate/StorageFileModals";

const LoadedStorageUploadModal = dynamic<StorageUploadModalProps>(
  () =>
    import("@/components/crm-boilerplate/StorageFileModals").then(
      (module) => module.StorageUploadModal,
    ),
  {
    ssr: false,
    loading: () => (
      <DeferredSolidTrigger
        disabled
        label="Loading..."
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedStorageEditModal = dynamic<StorageEditModalProps>(
  () =>
    import("@/components/crm-boilerplate/StorageFileModals").then(
      (module) => module.StorageEditModal,
    ),
  {
    ssr: false,
    loading: () => (
      <DeferredIconTrigger
        ariaLabel="Loading file edit action"
        disabled
        icon={<EditIcon />}
        onOpen={() => undefined}
      />
    ),
  },
);

const LoadedStorageDeleteModal = dynamic<StorageDeleteModalProps>(
  () =>
    import("@/components/crm-boilerplate/StorageFileModals").then(
      (module) => module.StorageDeleteModal,
    ),
  {
    ssr: false,
    loading: () => (
      <DeferredIconTrigger
        ariaLabel="Loading file delete action"
        disabled
        icon={<TrashBinIcon />}
        onOpen={() => undefined}
        tone="danger"
      />
    ),
  },
);

export function DeferredStorageUploadModal(props: StorageUploadModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <DeferredSolidTrigger label="Upload file" onOpen={open} />
      )}
    >
      {(autoOpen) => <LoadedStorageUploadModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredStorageEditModal(props: StorageEditModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <DeferredIconTrigger
          ariaLabel={`Edit ${props.file.originalName}`}
          icon={<EditIcon />}
          onOpen={open}
        />
      )}
    >
      {(autoOpen) => <LoadedStorageEditModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

export function DeferredStorageDeleteModal(props: StorageDeleteModalProps) {
  return (
    <DeferredActionLoader
      renderTrigger={(open) => (
        <DeferredIconTrigger
          ariaLabel={`Delete ${props.file.originalName}`}
          icon={<TrashBinIcon />}
          onOpen={open}
          tone="danger"
        />
      )}
    >
      {(autoOpen) => <LoadedStorageDeleteModal {...props} autoOpen={autoOpen} />}
    </DeferredActionLoader>
  );
}

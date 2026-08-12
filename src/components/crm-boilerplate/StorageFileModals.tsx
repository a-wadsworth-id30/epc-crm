"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import FileDropzone from "@/components/crm-boilerplate/FileDropzone";
import type { StorageFileRow } from "@/components/crm-boilerplate/StorageBrowser";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import { EditIcon, TrashBinIcon } from "@/icons";
import {
  deleteFileAssetAction,
  updateFileAssetAction,
  uploadFileAssetAction,
} from "@/lib/actions/storage";

export type StorageUploadPolicy = {
  allowedMimeTypes: string;
  isConfigured: boolean;
  maxUploadMb: number;
};

export type StorageUploadModalProps = {
  autoOpen?: boolean;
  uploadPolicy: StorageUploadPolicy;
};

export type StorageEditModalProps = {
  autoOpen?: boolean;
  file: StorageFileRow;
};

export type StorageDeleteModalProps = {
  autoOpen?: boolean;
  file: StorageFileRow;
};

export function StorageUploadModal({
  autoOpen,
  uploadPolicy,
}: StorageUploadModalProps) {
  const modal = useModal();
  const { closeModal, isOpen, openModal } = modal;
  const { showToast } = useToast();
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [resetSignal, setResetSignal] = useState(0);
  const [state, formAction, isPending] = useActionState(uploadFileAssetAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    showToast(state.message || "File uploaded.");
    queueMicrotask(() => {
      setSelectedFileNames([]);
      setResetSignal((value) => value + 1);
      closeModal();
    });
  }, [closeModal, showToast, state.message, state.ok]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
      >
        Upload file
      </button>
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="relative m-5 w-full max-w-[680px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Upload file
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Store a file in Cloudflare R2 and register it in the CRM file
            browser.
          </p>

          {!uploadPolicy.isConfigured ? (
            <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
              Cloudflare R2 credentials are not fully configured. Uploads will
              be available once storage credentials are saved.
              <Link
                href="/settings/integrations/cloudflare-r2"
                className="ml-2 font-semibold underline"
              >
                Check setup
              </Link>
            </div>
          ) : null}

          <form action={formAction} className="space-y-5">
            <div>
              <Label htmlFor="storage-upload-file">File</Label>
              <FileDropzone
                accept={uploadPolicy.allowedMimeTypes}
                disabled={!uploadPolicy.isConfigured || isPending}
                id="storage-upload-file"
                maxUploadMb={uploadPolicy.maxUploadMb}
                onSelectionChange={setSelectedFileNames}
                resetSignal={resetSignal}
                selectedFileNames={selectedFileNames}
                title="Drop files here or choose files"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="storage-upload-folder">Folder</Label>
                <Input
                  id="storage-upload-folder"
                  name="folder"
                  defaultValue="manual"
                  placeholder="manual, proposals, brand-assets"
                />
              </div>
              <div>
                <Label htmlFor="storage-upload-visibility">Visibility</Label>
                <select
                  id="storage-upload-visibility"
                  name="visibility"
                  defaultValue="PRIVATE"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </div>
              <div>
                <Label htmlFor="storage-upload-entity-type">
                  Linked entity type
                </Label>
                <Input
                  id="storage-upload-entity-type"
                  name="entityType"
                  placeholder="User, Contact, SalesOpportunity"
                />
              </div>
              <div>
                <Label htmlFor="storage-upload-entity-id">
                  Linked entity ID
                </Label>
                <Input id="storage-upload-entity-id" name="entityId" />
              </div>
              <div>
                <Label htmlFor="storage-upload-document-folder">
                  Document folder
                </Label>
                <Input
                  id="storage-upload-document-folder"
                  name="documentFolder"
                  placeholder="surveys-site-photos"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="storage-upload-notes">Notes</Label>
              <textarea
                id="storage-upload-notes"
                name="notes"
                rows={3}
                placeholder="Optional notes applied to every selected file"
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <Label htmlFor="storage-upload-tags">Tags</Label>
              <Input
                id="storage-upload-tags"
                name="tagsText"
                placeholder="proposal, customer upload, handover"
              />
            </div>

            <ActionStateMessage state={state.ok ? undefined : state} />

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 transition ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !uploadPolicy.isConfigured ||
                  !selectedFileNames.length ||
                  isPending
                }
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending
                  ? "Uploading..."
                  : `Upload ${selectedFileNames.length || ""} file${selectedFileNames.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}

export function StorageEditModal({ autoOpen, file }: StorageEditModalProps) {
  const modal = useModal();
  const { closeModal, isOpen, openModal } = modal;
  const { showToast } = useToast();
  const [isDirty, setIsDirty] = useState(false);
  const [state, formAction, isPending] = useActionState(updateFileAssetAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    showToast(state.message || "File updated.");
    queueMicrotask(() => {
      setIsDirty(false);
      closeModal();
    });
  }, [closeModal, showToast, state.message, state.ok]);

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
        aria-label={`Edit ${file.originalName}`}
      >
        <EditIcon />
      </button>
      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        className="relative m-5 w-full max-w-[620px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-1 font-semibold text-gray-800 dark:text-white/90">
            Edit file
          </h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Update browser metadata. The R2 object key remains unchanged.
          </p>
          <form
            action={formAction}
            onChangeCapture={() => setIsDirty(true)}
            className="space-y-5"
          >
            <input type="hidden" name="id" value={file.id} />
            <div>
              <Label htmlFor={`file-name-${file.id}`}>File name</Label>
              <Input
                id={`file-name-${file.id}`}
                name="originalName"
                defaultValue={file.originalName}
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor={`file-visibility-${file.id}`}>Visibility</Label>
                <select
                  id={`file-visibility-${file.id}`}
                  name="visibility"
                  defaultValue={file.visibility}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="PRIVATE">Private</option>
                  <option value="PUBLIC">Public</option>
                </select>
              </div>
              <div>
                <Label>R2 key</Label>
                <Input value={file.key} disabled />
              </div>
              <div>
                <Label htmlFor={`file-entity-type-${file.id}`}>
                  Linked entity type
                </Label>
                <Input
                  id={`file-entity-type-${file.id}`}
                  name="entityType"
                  defaultValue={file.entityType ?? ""}
                  placeholder="User, Contact, SalesOpportunity"
                />
              </div>
              <div>
                <Label htmlFor={`file-entity-id-${file.id}`}>
                  Linked entity ID
                </Label>
                <Input
                  id={`file-entity-id-${file.id}`}
                  name="entityId"
                  defaultValue={file.entityId ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`file-document-folder-${file.id}`}>
                  Document folder
                </Label>
                <Input
                  id={`file-document-folder-${file.id}`}
                  name="documentFolder"
                  defaultValue={file.documentFolder ?? ""}
                  placeholder="surveys-site-photos"
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`file-notes-${file.id}`}>Notes</Label>
              <textarea
                id={`file-notes-${file.id}`}
                name="notes"
                defaultValue={file.notes ?? ""}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </div>
            <div>
              <Label htmlFor={`file-tags-${file.id}`}>Tags</Label>
              <Input
                id={`file-tags-${file.id}`}
                name="tagsText"
                defaultValue={file.tags.join(", ")}
                placeholder="proposal, warranty, handover"
              />
            </div>
            <ActionStateMessage state={state.ok ? undefined : state} />
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-gray-300 transition ring-inset hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-white/[0.03] dark:hover:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !isDirty}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save file"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}

export function StorageDeleteModal({ autoOpen, file }: StorageDeleteModalProps) {
  const modal = useModal();
  const { openModal } = modal;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    if (autoOpen) {
      openModal();
    }
  }, [autoOpen, openModal]);

  return (
    <>
      <button
        type="button"
        onClick={modal.openModal}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error-300 text-error-600 hover:bg-error-50 dark:border-error-800 dark:hover:bg-error-900/20"
        aria-label={`Delete ${file.originalName}`}
      >
        <TrashBinIcon />
      </button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[480px] rounded-3xl bg-white p-6 sm:m-0 lg:p-8 dark:bg-gray-900"
      >
        <div>
          <h2 className="text-title-xs mb-2 font-semibold text-gray-800 dark:text-white/90">
            Delete file
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Delete {file.originalName} from R2 and remove it from the CRM file
            browser? This cannot be undone.
          </p>
          {message && (
            <div className="mt-4">
              <ActionStateMessage state={{ ok: false, message }} />
            </div>
          )}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={modal.closeModal}>
              Cancel
            </Button>
            <form
              action={async (formData) => {
                setIsSubmitting(true);
                setMessage("");
                const result = await deleteFileAssetAction(formData);
                setIsSubmitting(false);

                if (!result.ok) {
                  setMessage(result.message);
                  return;
                }

                modal.closeModal();
                showToast(result.message || "File deleted.");
              }}
            >
              <input type="hidden" name="id" value={file.id} />
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg bg-error-500 px-5 py-3.5 text-sm font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete file"}
              </button>
            </form>
          </div>
        </div>
      </Modal>
    </>
  );
}

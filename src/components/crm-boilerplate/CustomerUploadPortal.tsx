"use client";

import {
  CheckCircle2,
  Clock,
  FileText,
  LockKeyhole,
  ShieldCheck,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { CustomerLinkGuidance } from "@/components/crm-boilerplate/CustomerLinkGuidance";
import FileDropzone from "@/components/crm-boilerplate/FileDropzone";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { customerUploadMegabyte } from "@/lib/customer-upload-multipart-config";
import type { CustomerUploadPublicFile } from "@/lib/customer-upload-public-files";

export type CustomerUploadPortalItem = {
  description: string | null;
  fileCount: number;
  files: CustomerUploadPublicFile[];
  fulfilledAt: string | null;
  id: string;
  label: string;
};

export type CustomerUploadPortalProps = {
  branding: {
    logoUrl: string;
    name: string;
  };
  canRemoveFiles: boolean;
  expiresAt: string;
  isOpen: boolean;
  items: CustomerUploadPortalItem[];
  message: string | null;
  recipientName: string | null;
  token: string;
  uploadPolicy: {
    allowedMimeTypes: string;
    isConfigured: boolean;
    maxUploadMb: number;
  };
  uploadState: "completed" | "expired" | "open" | "revoked";
};

type CustomerUploadFormState = {
  ok: boolean;
  message: string;
  savedAt?: string;
};

type UploadProgress = {
  detail: string;
  label: string;
  percent: number;
};

const initialUploadState: CustomerUploadFormState = {
  ok: false,
  message: "",
};

type StartMultipartUploadResponse = {
  expiresAt: string;
  ok: true;
  partCount: number;
  partSize: number;
  uploadSession: string;
};

type UploadMultipartPartResponse = {
  eTag: string;
  ok: true;
  partNumber: number;
};

type UploadMultipartPartPayload =
  | UploadMultipartPartResponse
  | { message?: string; ok: false }
  | null;

type CompleteMultipartUploadResponse = {
  fileAssetId: string;
  ok: true;
  savedAt: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatReceivedDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("text/")) return "Text file";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return "Spreadsheet";
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "Document";
  }

  return "File";
}

function selectedFilesFromFormData(formData: FormData) {
  return formData
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);
}

function formDataText(formData: FormData, field: string) {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

async function uploadJson<T extends { message?: string; ok: boolean }>(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Document upload failed.");
  }

  return payload;
}

function uploadPercent(uploadedBytes: number, totalBytes: number) {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return 0;

  return Math.min(
    100,
    Math.max(0, Math.round((uploadedBytes / totalBytes) * 100)),
  );
}

function uploadMultipartPartWithProgress({
  body,
  headers,
  onProgress,
}: {
  body: Blob;
  headers: Record<string, string>;
  onProgress: (uploadedBytes: number) => void;
}) {
  return new Promise<UploadMultipartPartResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", "/api/customer-upload-requests/multipart/part");

    Object.entries(headers).forEach(([key, value]) => {
      request.setRequestHeader(key, value);
    });

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    request.onload = () => {
      let payload: UploadMultipartPartPayload = null;

      try {
        payload = JSON.parse(
          request.responseText || "null",
        ) as UploadMultipartPartPayload;
      } catch {
        reject(new Error("Upload chunk failed."));
        return;
      }

      if (
        request.status >= 200 &&
        request.status < 300 &&
        payload?.ok === true
      ) {
        resolve(payload);
        return;
      }

      reject(
        new Error(
          payload?.ok === false
            ? payload.message || "Upload chunk failed."
            : "Upload chunk failed.",
        ),
      );
    };

    request.onerror = () => reject(new Error("Upload connection failed."));
    request.onabort = () => reject(new Error("Upload was cancelled."));
    request.send(body);
  });
}

function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-brand-800 dark:text-brand-200">
        <span className="min-w-0 truncate">{progress.label}</span>
        <span className="shrink-0">{progress.percent}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-brand-100 dark:bg-gray-950 dark:ring-brand-900/40">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-200"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-brand-700 dark:text-brand-200">
        {progress.detail}
      </p>
    </div>
  );
}

function ReceivedFilesList({
  canRemoveFiles,
  files,
  isRemovingFileId,
  onRemove,
}: {
  canRemoveFiles: boolean;
  files: CustomerUploadPublicFile[];
  isRemovingFileId: string | null;
  onRemove: (file: CustomerUploadPublicFile) => void;
}) {
  if (!files.length) return null;

  return (
    <details
      open={files.length <= 3}
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950/40"
    >
      <summary className="cursor-pointer text-sm font-semibold text-gray-800 dark:text-white/90">
        <span className="inline-flex w-full items-center justify-between gap-3 pl-1">
          <span>Already received</span>
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-success-50 px-2 text-xs font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </span>
      </summary>
      {canRemoveFiles ? (
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Uploaded the wrong file? Remove it here, then upload the correct one.
        </p>
      ) : null}
      <ul className="mt-3 space-y-2">
        {files.map((file) => (
          <li
            key={`${file.id}-${file.receivedAt}`}
            className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:flex-row sm:items-start dark:border-gray-800 dark:bg-gray-900"
          >
            <span className="flex min-w-0 flex-1 gap-3">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600 ring-1 ring-success-100 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-semibold text-gray-900 dark:text-white">
                  {file.name}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {fileTypeLabel(file.mimeType)} ·{" "}
                  {formatBytes(file.sizeBytes)} · Received{" "}
                  {formatReceivedDateTime(file.receivedAt)}
                </span>
              </span>
            </span>
            {canRemoveFiles ? (
              <button
                type="button"
                disabled={Boolean(isRemovingFileId)}
                onClick={() => onRemove(file)}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-error-200 bg-white px-3 text-xs font-semibold text-error-700 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/40 dark:bg-gray-900 dark:text-error-300 dark:hover:bg-error-900/20"
              >
                {isRemovingFileId === file.id ? "Removing..." : "Remove"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ChecklistUploadForm({
  canRemoveFiles,
  isOpen,
  item,
  token,
  uploadPolicy,
}: {
  canRemoveFiles: boolean;
  isOpen: boolean;
  item: CustomerUploadPortalItem;
  token: string;
  uploadPolicy: CustomerUploadPortalProps["uploadPolicy"];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [chunkedState, setChunkedState] =
    useState<CustomerUploadFormState>(initialUploadState);
  const [isChunkedPending, setIsChunkedPending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [resetSignal, setResetSignal] = useState(0);
  const [showCompletedForm, setShowCompletedForm] = useState(false);
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);
  const inputId = `customer-upload-${item.id}`;
  const isUploading = isChunkedPending;
  const displayedState = chunkedState.message ? chunkedState : undefined;
  const shouldShowUploadForm =
    isOpen &&
    uploadPolicy.isConfigured &&
    (!item.fulfilledAt || showCompletedForm);

  async function uploadFileInChunks({
    deferRequestCompletion,
    file,
    fileIndex,
    fileTotal,
    notes,
    totalBytes,
    uploadedBytesBeforeFile,
  }: {
    deferRequestCompletion: boolean;
    file: File;
    fileIndex: number;
    fileTotal: number;
    notes: string;
    totalBytes: number;
    uploadedBytesBeforeFile: number;
  }) {
    let uploadSession = "";
    let uploadedBytesForFile = 0;

    try {
      setUploadProgress({
        detail: `File ${fileIndex + 1} of ${fileTotal}`,
        label: `Preparing ${file.name}`,
        percent: uploadPercent(uploadedBytesBeforeFile, totalBytes),
      });

      const upload = await uploadJson<StartMultipartUploadResponse>(
        "/api/customer-upload-requests/multipart/start",
        {
          body: JSON.stringify({
            deferRequestCompletion,
            fileName: file.name,
            fileSize: file.size,
            itemId: item.id,
            mimeType: file.type || "application/octet-stream",
            notes,
            tagsText: "",
            token,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      uploadSession = upload.uploadSession;
      const parts: UploadMultipartPartResponse[] = [];

      for (
        let partNumber = 1;
        partNumber <= upload.partCount;
        partNumber += 1
      ) {
        const start = (partNumber - 1) * upload.partSize;
        const end = Math.min(file.size, start + upload.partSize);
        const chunkSize = end - start;

        setUploadProgress({
          detail: `File ${fileIndex + 1} of ${fileTotal} · chunk ${partNumber} of ${upload.partCount}`,
          label: `Uploading ${file.name}`,
          percent: uploadPercent(
            uploadedBytesBeforeFile + uploadedBytesForFile,
            totalBytes,
          ),
        });

        const part = await uploadMultipartPartWithProgress({
          body: file.slice(start, end),
          headers: {
            "Content-Type": "application/octet-stream",
            "x-id30-upload-part-number": String(partNumber),
            "x-id30-upload-session": upload.uploadSession,
            "x-id30-upload-token": token,
          },
          onProgress: (uploadedChunkBytes) => {
            setUploadProgress({
              detail: `File ${fileIndex + 1} of ${fileTotal} · chunk ${partNumber} of ${upload.partCount}`,
              label: `Uploading ${file.name}`,
              percent: uploadPercent(
                uploadedBytesBeforeFile +
                  uploadedBytesForFile +
                  uploadedChunkBytes,
                totalBytes,
              ),
            });
          },
        });

        uploadedBytesForFile += chunkSize;

        parts.push({
          eTag: part.eTag,
          ok: true,
          partNumber: part.partNumber,
        });
      }

      setUploadProgress({
        detail: `File ${fileIndex + 1} of ${fileTotal}`,
        label: `Saving ${file.name}`,
        percent: uploadPercent(uploadedBytesBeforeFile + file.size, totalBytes),
      });

      await uploadJson<CompleteMultipartUploadResponse>(
        "/api/customer-upload-requests/multipart/complete",
        {
          body: JSON.stringify({
            parts,
            token,
            uploadSession: upload.uploadSession,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
    } catch (error) {
      if (uploadSession) {
        await fetch("/api/customer-upload-requests/multipart/abort", {
          body: JSON.stringify({ token, uploadSession }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        }).catch(() => undefined);
      }

      throw error;
    }
  }

  async function handleRemoveUploadedFile(file: CustomerUploadPublicFile) {
    const confirmed = window.confirm(
      `Remove "${file.name}" from this upload request? Our team will no longer see it as part of this request.`,
    );

    if (!confirmed) return;

    setChunkedState(initialUploadState);
    setRemovingFileId(file.id);

    try {
      const response = await fetch(
        "/api/customer-upload-requests/files/remove",
        {
          body: JSON.stringify({
            fileAssetId: file.id,
            itemId: item.id,
            token,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; ok: false }
        | { needsReplacement: boolean; ok: true }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.ok === false
            ? payload.message || "Uploaded file could not be removed."
            : "Uploaded file could not be removed.",
        );
      }

      const successState = {
        ok: true,
        message: payload.needsReplacement
          ? "File removed. Please upload the correct file to complete this request."
          : "File removed from this upload request.",
        savedAt: new Date().toISOString(),
      };

      setChunkedState(successState);
      setShowCompletedForm(true);
      showToast(successState.message);
      router.refresh();
    } catch (error) {
      setChunkedState({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Uploaded file could not be removed.",
      });
    } finally {
      setRemovingFileId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const files = selectedFilesFromFormData(formData);
    const selectedBytes = files.reduce((total, file) => total + file.size, 0);

    setChunkedState(initialUploadState);
    setUploadProgress(null);

    if (!uploadPolicy.isConfigured) {
      setChunkedState({
        ok: false,
        message: "Document uploads are temporarily unavailable.",
      });
      return;
    }

    setIsChunkedPending(true);
    setUploadProgress({
      detail: "Checking selected files before upload.",
      label: "Preparing upload",
      percent: 0,
    });

    try {
      if (!files.length) {
        throw new Error("Choose at least one document to upload.");
      }

      if (files.length > 20) {
        throw new Error("Upload 20 files or fewer at once.");
      }

      const maxBytes = uploadPolicy.maxUploadMb * customerUploadMegabyte;
      const tooLarge = files.find((file) => file.size > maxBytes);

      if (tooLarge) {
        throw new Error(
          `File must be ${uploadPolicy.maxUploadMb}MB or smaller.`,
        );
      }

      let uploadedBytes = 0;

      for (const [index, file] of files.entries()) {
        await uploadFileInChunks({
          deferRequestCompletion: index < files.length - 1,
          file,
          fileIndex: index,
          fileTotal: files.length,
          notes: formDataText(formData, "notes"),
          totalBytes: selectedBytes,
          uploadedBytesBeforeFile: uploadedBytes,
        });

        uploadedBytes += file.size;
        setUploadProgress({
          detail:
            index === files.length - 1
              ? "Finalising the upload."
              : `File ${index + 1} of ${files.length} complete.`,
          label:
            index === files.length - 1 ? "Upload complete" : "Continuing upload",
          percent: uploadPercent(uploadedBytes, selectedBytes),
        });
      }

      const successState = {
        ok: true,
        message: `${files.length} document${files.length === 1 ? "" : "s"} uploaded. We have received the file${files.length === 1 ? "" : "s"} and our team will review the next step.`,
        savedAt: new Date().toISOString(),
      };

      setChunkedState(successState);
      showToast(successState.message);
      setSelectedFileNames([]);
      setShowCompletedForm(false);
      setResetSignal((value) => value + 1);
      router.refresh();
    } catch (error) {
      setChunkedState({
        ok: false,
        message:
          error instanceof Error ? error.message : "Document upload failed.",
      });
    } finally {
      setIsChunkedPending(false);
      setUploadProgress(null);
    }
  }

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            item.fulfilledAt
              ? "bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300"
              : "bg-gray-50 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400"
          }`}
        >
          {item.fulfilledAt ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <FileText className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              {item.label}
            </h2>
            {item.fulfilledAt ? (
              <span className="inline-flex h-6 items-center rounded-full bg-success-50 px-2 text-xs font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
                Uploaded
              </span>
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-warning-50 px-2 text-xs font-semibold text-warning-700 ring-1 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40">
                Required
              </span>
            )}
          </div>
          {item.description ? (
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {item.description}
            </p>
          ) : null}
          {item.fileCount ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {item.fileCount} file{item.fileCount === 1 ? "" : "s"} received.
            </p>
          ) : null}
        </div>
      </div>

      <ReceivedFilesList
        canRemoveFiles={canRemoveFiles}
        files={item.files}
        isRemovingFileId={removingFileId}
        onRemove={handleRemoveUploadedFile}
      />

      {item.fulfilledAt && !showCompletedForm ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-success-100 bg-success-50/60 px-3 py-2 text-sm text-success-800 sm:flex-row sm:items-center sm:justify-between dark:border-success-900/40 dark:bg-success-900/10 dark:text-success-200">
          <span>
            We have received this item. No further action is needed unless you
            want to add another file.
          </span>
          {isOpen && uploadPolicy.isConfigured ? (
            <button
              type="button"
              onClick={() => setShowCompletedForm(true)}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-success-200 bg-white px-3 text-xs font-semibold text-success-700 transition hover:bg-success-50 dark:border-success-900/40 dark:bg-gray-900 dark:text-success-300 dark:hover:bg-success-900/20"
            >
              Add another file
            </button>
          ) : null}
        </div>
      ) : null}

      {shouldShowUploadForm ? (
        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="itemId" value={item.id} />
          <FileDropzone
            accept={uploadPolicy.allowedMimeTypes}
            disabled={!uploadPolicy.isConfigured || isUploading}
            id={inputId}
            maxUploadMb={uploadPolicy.maxUploadMb}
            onSelectionChange={setSelectedFileNames}
            resetSignal={resetSignal}
            selectedFileNames={selectedFileNames}
            title={
              item.fulfilledAt
                ? "Upload another file"
                : "Drop files here or choose files"
            }
          />
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Message to our team
            </span>
            <textarea
              name="notes"
              rows={3}
              placeholder="Optional context for the uploaded file"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-950 dark:text-white/90"
            />
          </label>
          <ActionStateMessage state={displayedState} />
          {uploadProgress ? (
            <UploadProgressBar progress={uploadProgress} />
          ) : null}
          <button
            type="submit"
            disabled={
              !uploadPolicy.isConfigured ||
              !selectedFileNames.length ||
              isUploading
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            {isUploading ? "Uploading..." : "Upload document"}
          </button>
        </form>
      ) : null}
    </article>
  );
}

export default function CustomerUploadPortal({
  branding,
  canRemoveFiles,
  expiresAt,
  isOpen,
  items,
  message,
  recipientName,
  token,
  uploadPolicy,
  uploadState,
}: CustomerUploadPortalProps) {
  const completedCount = items.filter(
    (item) => item.fulfilledAt || item.fileCount > 0,
  ).length;
  const allComplete = items.length > 0 && completedCount === items.length;
  const closedMessage =
    uploadState === "completed" || allComplete
      ? "We have received the requested documents. No further action is needed unless the team asks for anything else."
      : uploadState === "expired"
        ? "This upload link has expired. Reply to the email you received or ask the team for a new link."
        : uploadState === "revoked"
          ? "This upload link has been closed by the team. Please ask for a new link if you still need to send files."
          : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.logoUrl}
              alt={`${branding.name} logo`}
              className="h-14 max-w-[220px] object-contain"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-success-200 bg-success-50 px-3 py-1 text-xs font-semibold text-success-700 shadow-theme-xs dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure upload request from {branding.name}
            </span>
          </div>
        </div>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Secure document upload
              </h1>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {recipientName ? `${recipientName}, use` : "Use"} this private,
                time-limited page to upload the requested documents for review
                by the authorised {branding.name} team.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-gray-950/40">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <Clock className="h-4 w-4 text-gray-400" />
              Expires {formatDateTime(expiresAt)}
            </span>
            <span
              className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs font-semibold ring-1 ${
                isOpen
                  ? "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40"
                  : "bg-error-50 text-error-700 ring-error-200 dark:bg-error-900/20 dark:text-error-300 dark:ring-error-900/40"
              }`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-success-100 bg-success-50/60 p-3 dark:border-success-900/40 dark:bg-success-900/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-success-800 dark:text-success-200">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Private link
              </div>
              <p className="mt-1 text-xs leading-5 text-success-700 dark:text-success-200">
                This page only accepts the specific documents requested here.
              </p>
            </div>
            <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-800 dark:text-brand-200">
                <LockKeyhole className="h-4 w-4 shrink-0" />
                Encrypted transfer
              </div>
              <p className="mt-1 text-xs leading-5 text-brand-700 dark:text-brand-200">
                Files are sent over HTTPS before private CRM document storage.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
                <UserCheck className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                Limited access
              </div>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Only authorised team members can review submitted files.
              </p>
            </div>
          </div>

          {message ? (
            <p className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm leading-6 text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/10 dark:text-brand-200">
              {message}
            </p>
          ) : null}

          {!uploadPolicy.isConfigured ? (
            <p className="mt-4 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
              Document uploads are temporarily unavailable.
            </p>
          ) : null}

          {closedMessage ? (
            <p className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-300">
              {closedMessage}
            </p>
          ) : null}
        </section>

        <CustomerLinkGuidance
          summary="Use this secure page to send the exact documents listed below."
          steps={[
            "Open each requested item and choose a clear photo, scan or PDF copy.",
            "Add a short message if a file needs context, for example which bill or drawing it relates to.",
            "After you upload, the files go straight to our team and we will review them before getting back to you.",
          ]}
          note={`This private link only accepts the requested documents and expires on ${formatDateTime(expiresAt)}. If it expires, reply to the email you received and we can send a new link.`}
        />

        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <ChecklistUploadForm
              canRemoveFiles={canRemoveFiles}
              key={item.id}
              isOpen={isOpen}
              item={item}
              token={token}
              uploadPolicy={uploadPolicy}
            />
          ))}
        </div>

        <section className="mt-5 rounded-2xl border border-success-100 bg-success-50/40 p-4 shadow-theme-xs dark:border-success-900/40 dark:bg-success-900/10">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-success-600 ring-1 ring-success-100 dark:bg-gray-950 dark:text-success-300 dark:ring-success-900/40">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Confidential file handling
              </h2>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                These uploads may contain private or confidential information.
                Only use this link for documents requested by {branding.name};
                do not forward it unless our team asks you to share it with
                someone helping prepare the documents.
              </p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600 dark:text-success-300" />
                  <span>
                    Files are uploaded through this private link and stored in
                    private CRM document storage.
                  </span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600 dark:text-success-300" />
                  <span>
                    This page only shows customer-safe file details such as
                    filename, type, size and received time.
                  </span>
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600 dark:text-success-300" />
                  <span>
                    By uploading, you confirm you have permission to share these
                    documents. If you upload the wrong file, remove it while the
                    link is open or contact the team.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

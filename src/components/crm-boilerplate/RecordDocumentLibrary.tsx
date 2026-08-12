"use client";

import {
  Archive,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  Download,
  FileText,
  FolderClosed,
  FolderInput,
  Link2,
  Pencil,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Share2,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import CopyButton from "@/components/crm-boilerplate/CopyButton";
import FileDropzone from "@/components/crm-boilerplate/FileDropzone";
import FilePreviewButton from "@/components/crm-boilerplate/FilePreviewButton";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  createCustomerDocumentPortalAction,
  revokeCustomerDocumentPortalAction,
  type CustomerDocumentPortalActionState,
} from "@/lib/actions/customer-document-portals";
import {
  createCustomerDocumentShareAction,
  revokeCustomerDocumentShareAction,
  type CustomerDocumentShareActionState,
} from "@/lib/actions/customer-document-shares";
import {
  customerDocumentPortalState,
  customerDocumentPortalStateLabel,
} from "@/lib/customer-document-portals";
import {
  createCustomerUploadRequestAction,
  revokeCustomerUploadRequestAction,
  type CustomerUploadRequestActionState,
} from "@/lib/actions/customer-upload-requests";
import {
  customerDocumentShareState,
  customerDocumentShareStateLabel,
} from "@/lib/customer-document-shares";
import {
  documentUploadTypeDefinitions,
  type DocumentLibraryFolder,
} from "@/lib/document-library";
import {
  customerUploadRequestState,
  customerUploadRequestStateLabel,
} from "@/lib/customer-upload-requests";
import {
  bulkUpdateRecordDocumentsAction,
  updateRecordDocumentMetadataAction,
  uploadRecordDocumentAction,
  type RecordDocumentActionState,
} from "@/lib/actions/record-documents";
import {
  createSignatureRequestAction,
  refreshRecordSignatureRequestsAction,
  type SignatureRequestActionState,
} from "@/lib/actions/signature-requests";
import { isDocuSignSignableMimeType } from "@/lib/docusign/signable-documents";

export type RecordDocumentFile = {
  createdAt: string;
  documentFolder: string | null;
  id: string;
  mimeType: string;
  name: string;
  notes: string | null;
  sizeBytes: number;
  tags: string[];
  uploadedBy: string;
  url: string;
};

export type RecordDocumentUploadPolicy = {
  allowedMimeTypes: string;
  isConfigured: boolean;
  maxUploadMb: number;
};

export type RecordCustomerUploadRequest = {
  completedAt: string | null;
  completedItemCount: number;
  createdAt: string;
  expiresAt: string;
  id: string;
  itemCount: number;
  itemLabels: string[];
  recipientEmail: string | null;
  recipientName: string | null;
  revokedAt: string | null;
  status: string;
};

export type RecordCustomerDocumentShare = {
  createdAt: string;
  downloadCount: number;
  expiresAt: string;
  fileCount: number;
  fileNames: string[];
  firstDownloadedAt: string | null;
  id: string;
  lastDownloadedAt: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  revokedAt: string | null;
  status: string;
  subject: string;
};

export type RecordCustomerDocumentPortal = {
  completedUploadItemCount: number;
  createdAt: string;
  downloadCount: number;
  expiresAt: string;
  id: string;
  lastDownloadedAt: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  requestedDocumentLabels: string[];
  revokedAt: string | null;
  sentDocumentNames: string[];
  shareFileCount: number;
  status: string;
  subject: string;
  uploadCompletedAt: string | null;
  uploadItemCount: number;
};

export type RecordSignatureRequest = {
  certificateFileAssetId: string | null;
  certificateUrl: string | null;
  completedAt: string | null;
  createdAt: string;
  declinedAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  id: string;
  message: string | null;
  providerStatus: string | null;
  recipients: Array<{
    email: string;
    name: string;
    status: string;
  }>;
  sentAt: string | null;
  signedDocumentUrl: string | null;
  signedFileAssetId: string | null;
  sourceFileAssetId: string;
  status: string;
  subject: string;
  voidedAt: string | null;
};

export type RecordDocumentLibraryProps = {
  documentPortals?: RecordCustomerDocumentPortal[];
  documentShares?: RecordCustomerDocumentShare[];
  documents: RecordDocumentFile[];
  entityId: string;
  entityLabel: string;
  entityType: "Contact" | "Company" | "SalesOpportunity";
  folders: DocumentLibraryFolder[];
  signatureRequests?: RecordSignatureRequest[];
  uploadRequests?: RecordCustomerUploadRequest[];
  uploadPolicy: RecordDocumentUploadPolicy;
};

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function fileTypeLabel(mimeType: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.includes("spreadsheet")) return "Spreadsheet";
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "Document";
  }

  return "File";
}

function typeFilterValue(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (mimeType.includes("spreadsheet")) return "spreadsheet";
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return "document";
  }

  return "other";
}

function fileSearchText(file: RecordDocumentFile) {
  return [
    file.name,
    file.mimeType,
    file.notes,
    ...file.tags,
    fileTypeLabel(file.mimeType),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function openUploadRequestCount(requests: RecordCustomerUploadRequest[]) {
  return requests.filter(
    (request) =>
      customerUploadRequestState({
        completedAt: request.completedAt ? new Date(request.completedAt) : null,
        expiresAt: new Date(request.expiresAt),
        revokedAt: request.revokedAt ? new Date(request.revokedAt) : null,
        status: request.status,
      }) === "open",
  ).length;
}

function openDocumentPortalCount(portals: RecordCustomerDocumentPortal[]) {
  return portals.filter(
    (portal) =>
      customerDocumentPortalState({
        expiresAt: new Date(portal.expiresAt),
        revokedAt: portal.revokedAt ? new Date(portal.revokedAt) : null,
        status: portal.status,
      }) === "open",
  ).length;
}

function openDocumentShareCount(shares: RecordCustomerDocumentShare[]) {
  return shares.filter(
    (share) =>
      customerDocumentShareState({
        expiresAt: new Date(share.expiresAt),
        revokedAt: share.revokedAt ? new Date(share.revokedAt) : null,
        status: share.status,
      }) === "open",
  ).length;
}

function pendingSignatureRequestCount(requests: RecordSignatureRequest[]) {
  return requests.filter((request) =>
    ["DRAFT", "SENT", "DELIVERED"].includes(request.status),
  ).length;
}

function signatureRequestNeedsRefresh(request: RecordSignatureRequest) {
  return (
    ["DRAFT", "SENT", "DELIVERED"].includes(request.status) ||
    (request.status === "COMPLETED" &&
      (!request.signedFileAssetId ||
        !request.certificateFileAssetId ||
        Boolean(request.errorMessage)))
  );
}

function refreshableSignatureRequestCount(requests: RecordSignatureRequest[]) {
  return requests.filter(signatureRequestNeedsRefresh).length;
}

const initialSignatureRefreshState: SignatureRequestActionState = {
  checked: 0,
  completed: 0,
  failed: 0,
  ok: false,
  message: "",
  savedAt: null,
  updated: 0,
};

function SignatureStatusRefreshButton({
  entityId,
  entityType,
  requestCount,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  requestCount: number;
}) {
  const [state, formAction, isPending] = useActionState(
    refreshRecordSignatureRequestsAction,
    initialSignatureRefreshState,
  );
  const autoRefreshAttemptedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (!requestCount || autoRefreshAttemptedRef.current) return;

    autoRefreshAttemptedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [requestCount]);

  useEffect(() => {
    if (!state.savedAt) return;

    if (!state.ok || (state.updated ?? 0) > 0) {
      showToast(state.message);
    }

    if (state.ok && (state.updated ?? 0) > 0) {
      router.refresh();
    }
  }, [
    router,
    showToast,
    state.message,
    state.ok,
    state.savedAt,
    state.updated,
  ]);

  if (!requestCount) return null;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col items-end gap-2"
    >
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
        />
        {isPending ? "Refreshing..." : "Refresh DocuSign"}
      </button>
      <ActionStateMessage
        state={state.message && !state.ok ? state : undefined}
      />
    </form>
  );
}

function DocumentLibraryOverview({
  documentPortals,
  documentShares,
  documents,
  selectedCount,
  signatureRequests,
  uploadRequests,
}: {
  documentPortals: RecordCustomerDocumentPortal[];
  documentShares: RecordCustomerDocumentShare[];
  documents: RecordDocumentFile[];
  selectedCount: number;
  signatureRequests: RecordSignatureRequest[];
  uploadRequests: RecordCustomerUploadRequest[];
}) {
  const requestedUploadItems = uploadRequests.reduce(
    (total, request) => total + request.itemCount,
    0,
  );
  const completedUploadItems = uploadRequests.reduce(
    (total, request) => total + request.completedItemCount,
    0,
  );
  const sharedDocumentCount = documentShares.reduce(
    (total, share) => total + share.fileCount,
    0,
  );
  const overviewItems = [
    {
      label: "Stored",
      value: documents.length.toLocaleString("en-GB"),
      detail: "CRM files",
    },
    {
      label: "Customer uploads",
      value: requestedUploadItems
        ? `${completedUploadItems}/${requestedUploadItems}`
        : "0",
      detail: `${openUploadRequestCount(uploadRequests)} active links`,
    },
    {
      label: "Portals",
      value: openDocumentPortalCount(documentPortals).toLocaleString("en-GB"),
      detail: "Active customer links",
    },
    {
      label: "Shared",
      value: sharedDocumentCount.toLocaleString("en-GB"),
      detail: `${openDocumentShareCount(documentShares)} open links`,
    },
    {
      label: "Signatures",
      value:
        pendingSignatureRequestCount(signatureRequests).toLocaleString("en-GB"),
      detail: "Pending requests",
    },
    {
      label: "Selected",
      value: selectedCount.toLocaleString("en-GB"),
      detail: "Ready for actions",
    },
  ];

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {overviewItems.map((item) => (
        <span
          key={item.label}
          title={item.detail}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-950/30 dark:text-gray-400"
        >
          <span className="font-semibold text-gray-700 dark:text-gray-200">
            {item.value}
          </span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}

function signatureStatusLabel(status: string) {
  if (status === "COMPLETED") return "Signed";

  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function signatureStatusClassName(status: string) {
  if (status === "COMPLETED") {
    return "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40";
  }

  if (["DECLINED", "ERROR", "EXPIRED", "VOIDED"].includes(status)) {
    return "bg-error-50 text-error-700 ring-error-200 dark:bg-error-900/20 dark:text-error-300 dark:ring-error-900/40";
  }

  if (["SENT", "DELIVERED"].includes(status)) {
    return "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40";
  }

  return "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800";
}

function signatureRequestDate(request: RecordSignatureRequest) {
  return (
    request.completedAt ??
    request.declinedAt ??
    request.deliveredAt ??
    request.sentAt ??
    request.createdAt
  );
}

function latestSignatureRequest(requests: RecordSignatureRequest[]) {
  return requests.reduce<RecordSignatureRequest | null>((latest, request) => {
    if (!latest) return request;

    return new Date(signatureRequestDate(request)) >
      new Date(signatureRequestDate(latest))
      ? request
      : latest;
  }, null);
}

function signatureDocumentRole(
  file: RecordDocumentFile,
  requests: RecordSignatureRequest[],
) {
  if (requests.some((request) => request.certificateFileAssetId === file.id)) {
    return "DocuSign certificate";
  }

  if (requests.some((request) => request.signedFileAssetId === file.id)) {
    return "Signed document";
  }

  return null;
}

function hasOpenSignatureRequest(requests: RecordSignatureRequest[]) {
  return requests.some((request) =>
    ["DRAFT", "SENT", "DELIVERED"].includes(request.status),
  );
}

const initialSignatureRequestState: SignatureRequestActionState = {
  ok: false,
  message: "",
  savedAt: null,
};

function SignatureRequestForm({
  entityId,
  entityType,
  file,
  requests,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  file: RecordDocumentFile;
  requests: RecordSignatureRequest[];
}) {
  const [state, formAction, isPending] = useActionState(
    createSignatureRequestAction,
    initialSignatureRequestState,
  );
  const { showToast } = useToast();
  const canSend = isDocuSignSignableMimeType(file.mimeType);
  const hasOpenRequest = hasOpenSignatureRequest(requests);
  const subject = `Please sign ${file.name}`.slice(0, 140);

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "DocuSign request sent.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  if (!canSend && !requests.length) return null;

  return (
    <div className="space-y-2">
      {requests.length ? (
        <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                <PenLine className="h-3.5 w-3.5" />
                Signature requests
              </p>
              <div className="mt-2 space-y-2">
                {requests.slice(0, 3).map((request) => {
                  const recipient = request.recipients[0];

                  return (
                    <div key={request.id} className="text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex h-6 items-center rounded-full px-2 font-semibold ring-1 ${signatureStatusClassName(request.status)}`}
                        >
                          {signatureStatusLabel(request.status)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {recipient?.name || recipient?.email || "Signer"} ·{" "}
                          {formatDate(signatureRequestDate(request))}
                        </span>
                      </div>
                      {request.errorMessage ? (
                        <p className="mt-1 flex items-start gap-1.5 text-error-600 dark:text-error-300">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{request.errorMessage}</span>
                        </p>
                      ) : null}
                      {request.signedDocumentUrl || request.certificateUrl ? (
                        <div className="mt-1 flex flex-wrap gap-2">
                          {request.signedDocumentUrl ? (
                            <a
                              href={request.signedDocumentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Signed document
                            </a>
                          ) : null}
                          {request.certificateUrl ? (
                            <a
                              href={request.certificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
                            >
                              Certificate
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {canSend ? (
        <details className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
            <Send className="h-3.5 w-3.5" />
            Send for signature
          </summary>
          <form action={formAction} className="mt-3 space-y-3">
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="entityType" value={entityType} />
            <input type="hidden" name="fileId" value={file.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                  Signer name
                </span>
                <input
                  name="signerName"
                  disabled={isPending || hasOpenRequest}
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                  Signer email
                </span>
                <input
                  name="signerEmail"
                  type="email"
                  disabled={isPending || hasOpenRequest}
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Subject
              </span>
              <input
                name="subject"
                defaultValue={subject}
                maxLength={140}
                disabled={isPending || hasOpenRequest}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Message
              </span>
              <textarea
                name="message"
                rows={3}
                disabled={isPending || hasOpenRequest}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            {hasOpenRequest ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This document already has an open signature request.
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <ActionStateMessage state={state.message ? state : undefined} />
              <button
                type="submit"
                disabled={isPending || hasOpenRequest}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {isPending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function AutoFileUploadForm({
  entityId,
  entityType,
  uploadPolicy,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  uploadPolicy: RecordDocumentUploadPolicy;
}) {
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [resetSignal, setResetSignal] = useState(0);
  const [documentType, setDocumentType] = useState<string>(
    documentUploadTypeDefinitions[0].key,
  );
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(
    uploadRecordDocumentAction,
    {
      ok: false,
      message: "",
    } satisfies RecordDocumentActionState,
  );
  const inputId = `document-auto-upload-${entityType}-${entityId}`;
  const canSubmit = uploadPolicy.isConfigured && selectedFileNames.length > 0;

  useEffect(() => {
    if (!state.ok) return;

    showToast(state.message || "Document uploaded.");
    queueMicrotask(() => {
      setSelectedFileNames([]);
      setResetSignal((value) => value + 1);
    });
  }, [showToast, state.message, state.ok]);

  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] dark:border-brand-900/40 dark:bg-brand-900/10"
    >
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="documentType" value={documentType} />
      <label className="block">
        <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Document type
        </span>
        <select
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          disabled={!uploadPolicy.isConfigured || isPending}
          className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        >
          {documentUploadTypeDefinitions.map((definition) => (
            <option key={definition.key} value={definition.key}>
              {definition.label}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-2">
        <FileDropzone
          accept={uploadPolicy.allowedMimeTypes}
          disabled={!uploadPolicy.isConfigured || isPending}
          id={inputId}
          maxUploadMb={uploadPolicy.maxUploadMb}
          onSelectionChange={setSelectedFileNames}
          resetSignal={resetSignal}
          selectedFileNames={selectedFileNames}
          title="Drop documents here or choose files"
        />
      </div>
      <label className="block md:col-span-2">
        <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Notes
        </span>
        <textarea
          name="notes"
          rows={3}
          placeholder="Optional notes applied to every selected file"
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          disabled={!uploadPolicy.isConfigured || isPending}
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Tags
        </span>
        <input
          name="tagsText"
          placeholder="utility bill, survey"
          className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          disabled={!uploadPolicy.isConfigured || isPending}
        />
      </label>
      <div className="self-end">
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UploadCloud className="h-4 w-4" />
          {isPending
            ? "Uploading..."
            : selectedFileNames.length
              ? `Upload ${selectedFileNames.length} file${selectedFileNames.length === 1 ? "" : "s"}`
              : "Choose files first"}
        </button>
      </div>
      <div className="md:col-span-3">
        <ActionStateMessage
          state={state.message && !state.ok ? state : undefined}
        />
      </div>
    </form>
  );
}

const initialCustomerUploadRequestState: CustomerUploadRequestActionState = {
  ok: false,
  message: "",
};
const defaultCustomerDocumentTypeCount = documentUploadTypeDefinitions.filter(
  (definition) => definition.customerFacing,
).length;

function uploadRequestStateClassName(state: string) {
  if (state === "open") {
    return "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40";
  }

  if (state === "expired" || state === "revoked") {
    return "bg-error-50 text-error-700 ring-error-200 dark:bg-error-900/20 dark:text-error-300 dark:ring-error-900/40";
  }

  return "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800";
}

function RevokeUploadRequestForm({
  entityId,
  entityType,
  requestId,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  requestId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    revokeCustomerUploadRequestAction,
    initialCustomerUploadRequestState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Customer upload link revoked.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/40 dark:text-error-300 dark:hover:bg-error-900/20"
      >
        {isPending ? "Revoking..." : "Revoke"}
      </button>
      <ActionStateMessage
        state={state.message && !state.ok ? state : undefined}
      />
    </form>
  );
}

function CustomerUploadRequestPanel({
  entityId,
  entityType,
  uploadPolicy,
  uploadRequests,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  uploadPolicy: RecordDocumentUploadPolicy;
  uploadRequests: RecordCustomerUploadRequest[];
}) {
  const [state, formAction, isPending] = useActionState(
    createCustomerUploadRequestAction,
    initialCustomerUploadRequestState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Customer upload link created.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            <Link2 className="h-4 w-4 text-brand-500" />
            Request documents
            <LazyHelpTooltip content="Use this when you need the customer to upload missing documents. The CRM creates a private checklist link, files uploads into the right folders and shows the link only once." />
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Create an expiring checklist link for customer document uploads.
          </p>
        </div>
        <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
          Link shown once
        </span>
      </div>

      <form action={formAction} className="mt-4 space-y-4">
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="entityType" value={entityType} />
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Recipient name
            </span>
            <input
              name="recipientName"
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Recipient email
            </span>
            <input
              name="recipientEmail"
              type="email"
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Expires in days
            </span>
            <input
              name="expiresInDays"
              type="number"
              min={1}
              max={60}
              defaultValue={14}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Message
          </span>
          <textarea
            name="message"
            rows={3}
            placeholder="Tell the customer why we need these files and what happens after they upload."
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </label>

        <details
          open
          className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
            <span>Required documents</span>
            <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
              {defaultCustomerDocumentTypeCount} default
            </span>
          </summary>
          <fieldset className="mt-3">
            <legend className="sr-only">Required documents</legend>
            <div className="grid gap-2 md:grid-cols-2">
              {documentUploadTypeDefinitions.map((definition) => (
                <label
                  key={definition.key}
                  className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-950/50"
                >
                  <input
                    type="checkbox"
                    name="documentTypes"
                    value={definition.key}
                    defaultChecked={definition.customerFacing}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                  />
                  <span>
                    <span className="block font-medium text-gray-800 dark:text-white/90">
                      {definition.label}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                      {definition.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </details>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ActionStateMessage state={state.message ? state : undefined} />
          <button
            type="submit"
            disabled={!uploadPolicy.isConfigured || isPending}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Creating..." : "Create upload link"}
          </button>
        </div>

        <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          Private upload URLs are shown once. If a link is lost, expired or
          revoked, create a replacement request from this form.
        </p>

        {state.uploadUrl ? (
          <div className="rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-900/40 dark:bg-success-900/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                readOnly
                value={state.uploadUrl}
                className="h-10 min-w-0 flex-1 rounded-lg border border-success-200 bg-white px-3 text-sm text-gray-800 dark:border-success-900/50 dark:bg-gray-950 dark:text-white/90"
              />
              <CopyButton value={state.uploadUrl} />
            </div>
            {state.expiresAt ? (
              <p className="mt-2 text-xs text-success-700 dark:text-success-300">
                Expires {formatDateTime(state.expiresAt)}.
              </p>
            ) : null}
          </div>
        ) : null}
      </form>

      {uploadRequests.length ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Recent upload requests
          </h4>
          {uploadRequests.map((request) => {
            const stateKey = customerUploadRequestState({
              completedAt: request.completedAt
                ? new Date(request.completedAt)
                : null,
              expiresAt: new Date(request.expiresAt),
              revokedAt: request.revokedAt ? new Date(request.revokedAt) : null,
              status: request.status,
            });

            return (
              <div
                key={request.id}
                className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${uploadRequestStateClassName(stateKey)}`}
                      >
                        {customerUploadRequestStateLabel(stateKey)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {request.completedItemCount}/{request.itemCount}{" "}
                        uploaded
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {request.recipientName ||
                        request.recipientEmail ||
                        "Customer upload request"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      Created {formatDate(request.createdAt)} · expires{" "}
                      {formatDate(request.expiresAt)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                      {request.itemLabels.join(", ")}
                    </p>
                  </div>
                  {stateKey === "open" ? (
                    <RevokeUploadRequestForm
                      entityId={entityId}
                      entityType={entityType}
                      requestId={request.id}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

const initialCustomerDocumentPortalState: CustomerDocumentPortalActionState = {
  ok: false,
  message: "",
};

function SelectedDocumentDetails({
  documents,
  emptyMessage,
}: {
  documents: RecordDocumentFile[];
  emptyMessage: string;
}) {
  if (!documents.length) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
        Selected documents
      </p>
      <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto">
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex min-w-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
          >
            <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate font-medium text-gray-800 dark:text-white/90">
              {document.name}
            </span>
            <span className="shrink-0">
              {fileTypeLabel(document.mimeType)} ·{" "}
              {formatBytes(document.sizeBytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RevokeDocumentPortalForm({
  entityId,
  entityType,
  portalId,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  portalId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    revokeCustomerDocumentPortalAction,
    initialCustomerDocumentPortalState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Customer document portal revoked.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="portalId" value={portalId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/40 dark:text-error-300 dark:hover:bg-error-900/20"
      >
        {isPending ? "Revoking..." : "Revoke"}
      </button>
      <ActionStateMessage
        state={state.message && !state.ok ? state : undefined}
      />
    </form>
  );
}

function CustomerDocumentPortalPanel({
  documentPortals,
  entityId,
  entityLabel,
  entityType,
  selectedDocuments,
  selectedFileIds,
  showForm = true,
  showHistory = true,
  signatureRequests,
  uploadPolicy,
}: {
  documentPortals: RecordCustomerDocumentPortal[];
  entityId: string;
  entityLabel: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  selectedDocuments: RecordDocumentFile[];
  selectedFileIds: string[];
  showForm?: boolean;
  showHistory?: boolean;
  signatureRequests: RecordSignatureRequest[];
  uploadPolicy: RecordDocumentUploadPolicy;
}) {
  const [state, formAction, isPending] = useActionState(
    createCustomerDocumentPortalAction,
    initialCustomerDocumentPortalState,
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const { showToast } = useToast();
  const selectedCount = selectedFileIds.length;
  const signatureCount = signatureRequests.filter((request) =>
    ["SENT", "DELIVERED", "COMPLETED"].includes(request.status),
  ).length;
  const subject = `Document portal for ${entityLabel}`.slice(0, 140);

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Customer document portal created.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            <Link2 className="h-4 w-4 text-brand-500" />
            Customer document portal
            <LazyHelpTooltip content="Use a customer portal when one link should handle shared files, requested uploads and signer-specific DocuSign status for this record." />
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Create one secure customer link for uploads, shared documents and
            signature status.
          </p>
        </div>
        {showForm ? (
          <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
            {selectedCount} selected
          </span>
        ) : null}
      </div>

      {showForm ? (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="entityType" value={entityType} />
          {selectedFileIds.map((fileId) => (
            <input key={fileId} type="hidden" name="fileIds" value={fileId} />
          ))}

          <SelectedDocumentDetails
            documents={selectedDocuments}
            emptyMessage="No files selected. This portal can still request uploads, or show signer-specific DocuSign status when a recipient email is entered."
          />

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Recipient name
              </span>
              <input
                name="recipientName"
                disabled={isPending}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Recipient email
              </span>
              <input
                name="recipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                disabled={isPending}
                placeholder={
                  signatureCount
                    ? "Required for signature status"
                    : "Email sends automatically"
                }
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Expires in days
              </span>
              <input
                name="expiresInDays"
                type="number"
                min={1}
                max={90}
                defaultValue={30}
                disabled={isPending}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
          </div>

          {signatureCount ? (
            <p className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs leading-5 text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/10 dark:text-brand-200">
              DocuSign status is included only when the recipient email matches
              the signer. Portals without an email will not show signature
              requests.
            </p>
          ) : null}

          <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Customer preview: they can download {selectedCount} selected file
            {selectedCount === 1 ? "" : "s"}, upload requested documents and
            {signatureCount
              ? " view signer-specific DocuSign status when their email matches the signer."
              : " see any matching DocuSign status when a signer email is included later."}{" "}
            Enter an email to send automatically, or leave it blank and copy the
            one-time link.
          </p>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Subject
            </span>
            <input
              name="subject"
              defaultValue={subject}
              maxLength={140}
              disabled={isPending}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Message
            </span>
            <textarea
              name="message"
              rows={3}
              placeholder="Tell the customer what this portal is for, what they should do first and what happens next."
              disabled={isPending}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>

          <details
            open
            className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
              <span>Documents requested from customer</span>
              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                {defaultCustomerDocumentTypeCount} default
              </span>
            </summary>
            <fieldset className="mt-3">
              <legend className="sr-only">
                Documents requested from customer
              </legend>
              <div className="grid gap-2 md:grid-cols-2">
                {documentUploadTypeDefinitions.map((definition) => (
                  <label
                    key={definition.key}
                    className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 bg-white p-3 text-sm dark:border-gray-800 dark:bg-gray-950/50"
                  >
                    <input
                      type="checkbox"
                      name="documentTypes"
                      value={definition.key}
                      defaultChecked={definition.customerFacing}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                    />
                    <span>
                      <span className="block font-medium text-gray-800 dark:text-white/90">
                        {definition.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {definition.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </details>

          <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Private portal URLs are shown once. If a link is lost, expired or
            revoked, create a replacement portal from this form.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ActionStateMessage state={state.message ? state : undefined} />
            <button
              type="submit"
              disabled={!uploadPolicy.isConfigured || isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isPending ? "Creating..." : "Create portal"}
            </button>
          </div>

          {state.portalUrl ? (
            <div className="rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-900/40 dark:bg-success-900/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={state.portalUrl}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-success-200 bg-white px-3 text-sm text-gray-800 dark:border-success-900/50 dark:bg-gray-950 dark:text-white/90"
                />
                <CopyButton value={state.portalUrl} />
              </div>
              {state.expiresAt ? (
                <p className="mt-2 text-xs text-success-700 dark:text-success-300">
                  Expires {formatDateTime(state.expiresAt)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}

      {showHistory && documentPortals.length ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Recent customer portals
          </h4>
          {documentPortals.map((portal) => {
            const stateKey = customerDocumentPortalState({
              expiresAt: new Date(portal.expiresAt),
              revokedAt: portal.revokedAt ? new Date(portal.revokedAt) : null,
              status: portal.status,
            });

            return (
              <div
                key={portal.id}
                className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${uploadRequestStateClassName(stateKey)}`}
                      >
                        {customerDocumentPortalStateLabel(stateKey)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {portal.completedUploadItemCount}/
                        {portal.uploadItemCount} uploads ·{" "}
                        {portal.shareFileCount} sent · {portal.downloadCount}{" "}
                        downloads
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {portal.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {portal.recipientName ||
                        portal.recipientEmail ||
                        "Customer portal"}{" "}
                      · created {formatDate(portal.createdAt)} · expires{" "}
                      {formatDate(portal.expiresAt)}
                    </p>
                    {portal.lastDownloadedAt ? (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Last downloaded{" "}
                        {formatDateTime(portal.lastDownloadedAt)}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                      {[
                        ...portal.requestedDocumentLabels,
                        ...portal.sentDocumentNames,
                      ].join(", ")}
                    </p>
                  </div>
                  {stateKey === "open" ? (
                    <RevokeDocumentPortalForm
                      entityId={entityId}
                      entityType={entityType}
                      portalId={portal.id}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

const initialCustomerDocumentShareState: CustomerDocumentShareActionState = {
  ok: false,
  message: "",
};

function RevokeDocumentShareForm({
  entityId,
  entityType,
  shareId,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  shareId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    revokeCustomerDocumentShareAction,
    initialCustomerDocumentShareState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Document share link revoked.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="shareId" value={shareId} />
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center justify-center rounded-lg border border-error-200 px-3 text-xs font-semibold text-error-600 transition hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-900/40 dark:text-error-300 dark:hover:bg-error-900/20"
      >
        {isPending ? "Revoking..." : "Revoke"}
      </button>
      <ActionStateMessage
        state={state.message && !state.ok ? state : undefined}
      />
    </form>
  );
}

function CustomerDocumentSharePanel({
  documentShares,
  entityId,
  entityLabel,
  entityType,
  selectedDocuments,
  selectedFileIds,
  showForm = true,
  showHistory = true,
  uploadPolicy,
}: {
  documentShares: RecordCustomerDocumentShare[];
  entityId: string;
  entityLabel: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  selectedDocuments: RecordDocumentFile[];
  selectedFileIds: string[];
  showForm?: boolean;
  showHistory?: boolean;
  uploadPolicy: RecordDocumentUploadPolicy;
}) {
  const [state, formAction, isPending] = useActionState(
    createCustomerDocumentShareAction,
    initialCustomerDocumentShareState,
  );
  const { showToast } = useToast();
  const selectedCount = selectedFileIds.length;
  const subject = `Documents for ${entityLabel}`.slice(0, 140);

  useEffect(() => {
    if (!state.ok || !state.savedAt) return;
    showToast(state.message || "Document share link created.");
  }, [showToast, state.message, state.ok, state.savedAt]);

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            <Share2 className="h-4 w-4 text-brand-500" />
            Send selected files
            <LazyHelpTooltip content="Use this for a simple expiring download link. Select files in the Library first, then create the link for the customer." />
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Share selected CRM documents through an expiring customer link.
          </p>
        </div>
        {showForm ? (
          <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
            {selectedCount} selected
          </span>
        ) : null}
      </div>

      {showForm ? (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="entityType" value={entityType} />
          {selectedFileIds.map((fileId) => (
            <input key={fileId} type="hidden" name="fileIds" value={fileId} />
          ))}

          <SelectedDocumentDetails
            documents={selectedDocuments}
            emptyMessage="Select one or more files in the Library tab before creating a document share link."
          />

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Recipient name
              </span>
              <input
                name="recipientName"
                disabled={isPending}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Recipient email
              </span>
              <input
                name="recipientEmail"
                type="email"
                disabled={isPending}
                placeholder="Email sends automatically"
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                Expires in days
              </span>
              <input
                name="expiresInDays"
                type="number"
                min={1}
                max={60}
                defaultValue={14}
                disabled={isPending}
                className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Subject
            </span>
            <input
              name="subject"
              defaultValue={subject}
              maxLength={140}
              disabled={isPending}
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
              Message
            </span>
            <textarea
              name="message"
              rows={3}
              placeholder="Tell the customer what the files are for and what to do if anything looks wrong."
              disabled={isPending}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </label>

          <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs leading-5 text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Enter an email to send automatically, or leave it blank and copy the
            one-time link. Private share URLs are shown once; if a link is lost,
            expired or revoked, create a replacement share link from this form.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <ActionStateMessage state={state.message ? state : undefined} />
            <button
              type="submit"
              disabled={
                !uploadPolicy.isConfigured || selectedCount === 0 || isPending
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isPending ? "Creating..." : "Create share link"}
            </button>
          </div>

          {state.shareUrl ? (
            <div className="rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-900/40 dark:bg-success-900/20">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  readOnly
                  value={state.shareUrl}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-success-200 bg-white px-3 text-sm text-gray-800 dark:border-success-900/50 dark:bg-gray-950 dark:text-white/90"
                />
                <CopyButton value={state.shareUrl} />
              </div>
              {state.expiresAt ? (
                <p className="mt-2 text-xs text-success-700 dark:text-success-300">
                  Expires {formatDateTime(state.expiresAt)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : null}

      {showHistory && documentShares.length ? (
        <div className="mt-4 space-y-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Recent sent document links
          </h4>
          {documentShares.map((share) => {
            const stateKey = customerDocumentShareState({
              expiresAt: new Date(share.expiresAt),
              revokedAt: share.revokedAt ? new Date(share.revokedAt) : null,
              status: share.status,
            });

            return (
              <div
                key={share.id}
                className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${uploadRequestStateClassName(stateKey)}`}
                      >
                        {customerDocumentShareStateLabel(stateKey)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {share.fileCount} file{share.fileCount === 1 ? "" : "s"}{" "}
                        · {share.downloadCount} download
                        {share.downloadCount === 1 ? "" : "s"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {share.subject}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {share.recipientName ||
                        share.recipientEmail ||
                        "Shared link"}{" "}
                      · created {formatDate(share.createdAt)} · expires{" "}
                      {formatDate(share.expiresAt)}
                    </p>
                    {share.lastDownloadedAt ? (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Last downloaded {formatDateTime(share.lastDownloadedAt)}
                      </p>
                    ) : null}
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                      {share.fileNames.join(", ")}
                    </p>
                  </div>
                  {stateKey === "open" ? (
                    <RevokeDocumentShareForm
                      entityId={entityId}
                      entityType={entityType}
                      shareId={share.id}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function SignatureRequestsPanel({
  documents,
  signatureRequests,
}: {
  documents: RecordDocumentFile[];
  signatureRequests: RecordSignatureRequest[];
}) {
  const documentsById = useMemo(
    () => new Map(documents.map((document) => [document.id, document])),
    [documents],
  );
  const sortedRequests = useMemo(
    () =>
      [...signatureRequests].sort(
        (first, second) =>
          new Date(signatureRequestDate(second)).getTime() -
          new Date(signatureRequestDate(first)).getTime(),
      ),
    [signatureRequests],
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
            <PenLine className="h-4 w-4 text-brand-500" />
            Signatures
            <LazyHelpTooltip content="Tracks DocuSign requests for this record, including sent, delivered, completed, signed documents and certificates." />
          </h3>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Track DocuSign requests, signed documents and certificates for this
            record.
          </p>
        </div>
        <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
          {pendingSignatureRequestCount(signatureRequests)} pending
        </span>
      </div>

      {sortedRequests.length ? (
        <div className="mt-4 space-y-2">
          {sortedRequests.map((request) => {
            const recipient = request.recipients[0];
            const sourceDocument = documentsById.get(request.sourceFileAssetId);
            const signedDocument = request.signedFileAssetId
              ? documentsById.get(request.signedFileAssetId)
              : null;
            const certificateDocument = request.certificateFileAssetId
              ? documentsById.get(request.certificateFileAssetId)
              : null;

            return (
              <div
                key={request.id}
                className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${signatureStatusClassName(request.status)}`}
                      >
                        {signatureStatusLabel(request.status)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {recipient?.name || recipient?.email || "Signer"} ·{" "}
                        {formatDate(signatureRequestDate(request))}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-gray-800 dark:text-white/90">
                      {request.subject}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      Source: {sourceDocument?.name ?? "Original document"}
                    </p>
                    {request.errorMessage ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-error-600 dark:text-error-300">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{request.errorMessage}</span>
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {request.signedDocumentUrl ? (
                      <a
                        href={request.signedDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Signed
                      </a>
                    ) : null}
                    {request.certificateUrl ? (
                      <a
                        href={request.certificateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        Certificate
                      </a>
                    ) : null}
                  </div>
                </div>
                {signedDocument || certificateDocument ? (
                  <p className="mt-2 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                    Filed:{" "}
                    {[signedDocument?.name, certificateDocument?.name]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          No signature requests yet. Send a signable PDF or Word document from
          the Library tab.
        </p>
      )}
    </section>
  );
}

function SelectedDocumentTray({
  documents,
  onClear,
  onSend,
}: {
  documents: RecordDocumentFile[];
  onClear: () => void;
  onSend: () => void;
}) {
  if (!documents.length) return null;

  return (
    <div className="mt-3 rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2 dark:border-brand-900/40 dark:bg-brand-900/10">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700 dark:text-brand-200">
            {documents.length} selected
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">
            {documents.map((document) => document.name).join(", ")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSend}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-brand-500 px-2.5 text-xs font-semibold text-white transition hover:bg-brand-600"
          >
            <Send className="h-3.5 w-3.5" />
            Send selected
          </button>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-brand-200 bg-white text-brand-700 transition hover:bg-brand-50 dark:border-brand-900/50 dark:bg-gray-950 dark:text-brand-200 dark:hover:bg-brand-900/20"
            aria-label="Clear selected documents"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

type SendToCustomerMode = "share" | "portal" | "history";

function SendToCustomerPanel({
  documentPortals,
  documentShares,
  entityId,
  entityLabel,
  entityType,
  selectedDocuments,
  selectedFileIds,
  signatureRequests,
  uploadPolicy,
}: {
  documentPortals: RecordCustomerDocumentPortal[];
  documentShares: RecordCustomerDocumentShare[];
  entityId: string;
  entityLabel: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  selectedDocuments: RecordDocumentFile[];
  selectedFileIds: string[];
  signatureRequests: RecordSignatureRequest[];
  uploadPolicy: RecordDocumentUploadPolicy;
}) {
  const [mode, setMode] = useState<SendToCustomerMode>("share");
  const modes: Array<{
    description: string;
    key: SendToCustomerMode;
    label: string;
  }> = [
    {
      description: "Simple expiring download link for selected files.",
      key: "share",
      label: "Send selected files",
    },
    {
      description: "One customer link for files, upload requests and signatures.",
      key: "portal",
      label: "Create customer portal",
    },
    {
      description: "Review recent portals and share links.",
      key: "history",
      label: "History",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
              Send to customer
              <LazyHelpTooltip content="Choose whether to send selected files, create a fuller customer portal, or review previous customer document links." />
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
              Choose the type of customer link before creating it.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {modes.map((item) => {
              const isActive = mode === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setMode(item.key)}
                  title={item.description}
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    isActive
                      ? "border-brand-200 bg-white text-brand-700 shadow-theme-xs dark:border-brand-900/50 dark:bg-gray-900 dark:text-brand-200"
                      : "border-gray-200 bg-white text-gray-600 hover:border-brand-200 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/50"
                  }`}
                >
                  <span className="block text-xs font-semibold">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-xs leading-4 text-gray-500 dark:text-gray-400">
                    {item.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {mode === "share" ? (
        <CustomerDocumentSharePanel
          documentShares={documentShares}
          entityId={entityId}
          entityLabel={entityLabel}
          entityType={entityType}
          selectedDocuments={selectedDocuments}
          selectedFileIds={selectedFileIds}
          showHistory={false}
          uploadPolicy={uploadPolicy}
        />
      ) : null}

      {mode === "portal" ? (
        <CustomerDocumentPortalPanel
          documentPortals={documentPortals}
          entityId={entityId}
          entityLabel={entityLabel}
          entityType={entityType}
          selectedDocuments={selectedDocuments}
          selectedFileIds={selectedFileIds}
          showHistory={false}
          signatureRequests={signatureRequests}
          uploadPolicy={uploadPolicy}
        />
      ) : null}

      {mode === "history" ? (
        documentPortals.length || documentShares.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {documentPortals.length ? (
              <CustomerDocumentPortalPanel
                documentPortals={documentPortals}
                entityId={entityId}
                entityLabel={entityLabel}
                entityType={entityType}
                selectedDocuments={selectedDocuments}
                selectedFileIds={selectedFileIds}
                showForm={false}
                signatureRequests={signatureRequests}
                uploadPolicy={uploadPolicy}
              />
            ) : null}
            {documentShares.length ? (
              <CustomerDocumentSharePanel
                documentShares={documentShares}
                entityId={entityId}
                entityLabel={entityLabel}
                entityType={entityType}
                selectedDocuments={selectedDocuments}
                selectedFileIds={selectedFileIds}
                showForm={false}
                uploadPolicy={uploadPolicy}
              />
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No customer document links have been created for this record yet.
          </p>
        )
      ) : null}
    </div>
  );
}

function DocumentMetadataForm({
  entityId,
  entityType,
  file,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  file: RecordDocumentFile;
}) {
  const [state, formAction, isPending] = useActionState(
    updateRecordDocumentMetadataAction,
    {
      ok: false,
      message: "",
    } satisfies RecordDocumentActionState,
  );
  const { showToast } = useToast();

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Document details saved.");
  }, [showToast, state.message, state.ok]);

  return (
    <details className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
        <Pencil className="h-3.5 w-3.5" />
        Notes and tags
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="fileId" value={file.id} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="entityType" value={entityType} />
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Notes
          </span>
          <textarea
            name="notes"
            defaultValue={file.notes ?? ""}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
            Tags
          </span>
          <input
            name="tagsText"
            defaultValue={file.tags.join(", ")}
            placeholder="utility bill, handover"
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
        </label>
        <ActionStateMessage
          state={state.message && !state.ok ? state : undefined}
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Saving..." : "Save details"}
        </button>
      </form>
    </details>
  );
}

function DocumentList({
  entityId,
  entityType,
  files,
  onToggleFile,
  selectedFileIds,
  signatureRequests,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  files: RecordDocumentFile[];
  onToggleFile: (fileId: string) => void;
  selectedFileIds: Set<string>;
  signatureRequests: RecordSignatureRequest[];
}) {
  if (!files.length) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
        No documents.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => {
        const fileSignatureRequests = signatureRequests.filter(
          (request) => request.sourceFileAssetId === file.id,
        );
        const latestRequest = latestSignatureRequest(fileSignatureRequests);
        const documentRole = signatureDocumentRole(file, signatureRequests);

        return (
          <div
            key={file.id}
            className="rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-800"
          >
            <div className="flex min-w-0 items-center gap-3">
              <input
                type="checkbox"
                checked={selectedFileIds.has(file.id)}
                onChange={() => onToggleFile(file.id)}
                aria-label={`Select ${file.name}`}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-950"
              />
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {file.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                  {fileTypeLabel(file.mimeType)} · {formatBytes(file.sizeBytes)}{" "}
                  · uploaded {formatDate(file.createdAt)} by {file.uploadedBy}
                </span>
              </span>
              <FilePreviewButton
                file={{
                  createdAt: formatDate(file.createdAt),
                  mimeType: file.mimeType,
                  name: file.name,
                  notes: file.notes,
                  sizeLabel: formatBytes(file.sizeBytes),
                  tags: file.tags,
                  uploadedBy: file.uploadedBy,
                  url: file.url,
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
              />
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                aria-label={`Open ${file.name}`}
              >
                <Download className="h-4 w-4" />
              </a>
            </div>
            {documentRole || latestRequest ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {documentRole ? (
                  <span className="inline-flex h-6 items-center rounded-full bg-success-50 px-2 text-xs font-semibold text-success-700 ring-1 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40">
                    {documentRole}
                  </span>
                ) : null}
                {latestRequest ? (
                  <span
                    className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${signatureStatusClassName(latestRequest.status)}`}
                  >
                    {signatureStatusLabel(latestRequest.status)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {file.tags.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {file.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {file.notes ? (
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                {file.notes}
              </p>
            ) : null}
            <details className="mt-2 rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-950/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
                <span>More actions</span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </summary>
              <div className="mt-2 space-y-2">
                <SignatureRequestForm
                  entityId={entityId}
                  entityType={entityType}
                  file={file}
                  requests={fileSignatureRequests}
                />
                <DocumentMetadataForm
                  entityId={entityId}
                  entityType={entityType}
                  file={file}
                />
              </div>
            </details>
          </div>
        );
      })}
    </div>
  );
}

const initialBulkDocumentState: RecordDocumentActionState = {
  ok: false,
  message: "",
};

function BulkDocumentActions({
  entityId,
  entityType,
  filteredDocumentCount,
  folders,
  onClearSelection,
  onSelectFiltered,
  selectedFileIds,
  selectedFilteredCount,
}: {
  entityId: string;
  entityType: RecordDocumentLibraryProps["entityType"];
  filteredDocumentCount: number;
  folders: DocumentLibraryFolder[];
  onClearSelection: () => void;
  onSelectFiltered: () => void;
  selectedFileIds: string[];
  selectedFilteredCount: number;
}) {
  const [bulkAction, setBulkAction] = useState<
    "move" | "add-tags" | "replace-tags"
  >("move");
  const [state, formAction, isPending] = useActionState(
    bulkUpdateRecordDocumentsAction,
    initialBulkDocumentState,
  );
  const { showToast } = useToast();
  const selectedCount = selectedFileIds.length;
  const allFilteredSelected =
    filteredDocumentCount > 0 &&
    selectedFilteredCount === filteredDocumentCount;

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Documents updated.");
    onClearSelection();
  }, [onClearSelection, showToast, state.message, state.ok]);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-2.5 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-md bg-white px-2.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800">
            {selectedCount
              ? `${selectedCount} selected`
              : `${filteredDocumentCount} shown`}
          </span>
          <button
            type="button"
            onClick={allFilteredSelected ? onClearSelection : onSelectFiltered}
            disabled={!filteredDocumentCount}
            className="inline-flex h-8 items-center justify-center rounded-md border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            {allFilteredSelected
              ? "Clear selected"
              : `Select filtered (${filteredDocumentCount})`}
          </button>
          {selectedCount ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 text-gray-600 transition hover:bg-white dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              aria-label="Clear selected documents"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {selectedCount ? (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <form
              action={formAction}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input type="hidden" name="entityId" value={entityId} />
              <input type="hidden" name="entityType" value={entityType} />
              {selectedFileIds.map((fileId) => (
                <input
                  key={fileId}
                  type="hidden"
                  name="fileIds"
                  value={fileId}
                />
              ))}
              <label className="sr-only" htmlFor="record-document-bulk-action">
                Bulk action
              </label>
              <select
                id="record-document-bulk-action"
                name="action"
                value={bulkAction}
                onChange={(event) =>
                  setBulkAction(
                    event.target.value as "move" | "add-tags" | "replace-tags",
                  )
                }
                className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              >
                <option value="move">Move folder</option>
                <option value="add-tags">Add tags</option>
                <option value="replace-tags">Replace tags</option>
              </select>
              {bulkAction === "move" ? (
                <label className="sr-only" htmlFor="record-document-bulk-folder">
                  Folder
                </label>
              ) : (
                <label className="sr-only" htmlFor="record-document-bulk-tags">
                  Tags
                </label>
              )}
              {bulkAction === "move" ? (
                <select
                  id="record-document-bulk-folder"
                  name="documentFolder"
                  className="h-10 min-w-[190px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="__unfiled">Unfiled documents</option>
                  {folders.map((folder) => (
                    <option key={folder.slug} value={folder.slug}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="record-document-bulk-tags"
                  name="tagsText"
                  placeholder="proposal, handover"
                  className="h-10 min-w-[220px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              )}
              <button
                type="submit"
                disabled={!selectedCount || isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkAction === "move" ? (
                  <FolderInput className="h-4 w-4" />
                ) : (
                  <Tags className="h-4 w-4" />
                )}
                {isPending ? "Applying..." : "Apply"}
              </button>
            </form>

          <form
            action="/api/record-documents/bulk-download"
            method="post"
            className="flex"
          >
            <input type="hidden" name="entityId" value={entityId} />
            <input type="hidden" name="entityType" value={entityType} />
            {selectedFileIds.map((fileId) => (
              <input key={fileId} type="hidden" name="fileIds" value={fileId} />
            ))}
            <button
              type="submit"
              disabled={!selectedCount}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              <Archive className="h-4 w-4" />
              Download ZIP
            </button>
          </form>
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Select files to move, tag or download.
          </p>
        )}
      </div>
      <div className="mt-3">
        <ActionStateMessage
          state={state.message && !state.ok ? state : undefined}
        />
      </div>
    </div>
  );
}

type DocumentLibraryTab =
  | "files"
  | "upload"
  | "requests"
  | "sent"
  | "signatures";

export default function RecordDocumentLibrary({
  documentPortals = [],
  documentShares = [],
  documents,
  entityId,
  entityLabel,
  entityType,
  folders,
  signatureRequests = [],
  uploadRequests = [],
  uploadPolicy,
}: RecordDocumentLibraryProps) {
  const [activeTab, setActiveTab] = useState<DocumentLibraryTab>("files");
  const [documentQuery, setDocumentQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const configuredSlugs = useMemo(
    () => new Set(folders.map((folder) => folder.slug)),
    [folders],
  );
  const filteredDocuments = useMemo(() => {
    const query = documentQuery.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesQuery = !query || fileSearchText(document).includes(query);
      const matchesType =
        typeFilter === "all" ||
        typeFilterValue(document.mimeType) === typeFilter;

      return matchesQuery && matchesType;
    });
  }, [documentQuery, documents, typeFilter]);
  const filteredDocumentIds = useMemo(
    () => filteredDocuments.map((document) => document.id),
    [filteredDocuments],
  );
  const availableFileIds = useMemo(
    () => new Set(documents.map((document) => document.id)),
    [documents],
  );
  const activeSelectedFileIds = useMemo(
    () => selectedFileIds.filter((fileId) => availableFileIds.has(fileId)),
    [availableFileIds, selectedFileIds],
  );
  const selectedFileIdSet = useMemo(
    () => new Set(activeSelectedFileIds),
    [activeSelectedFileIds],
  );
  const selectedDocuments = useMemo(
    () => documents.filter((document) => selectedFileIdSet.has(document.id)),
    [documents, selectedFileIdSet],
  );
  const selectedFilteredCount = filteredDocumentIds.filter((fileId) =>
    selectedFileIdSet.has(fileId),
  ).length;
  const documentsByFolder = useMemo(() => {
    const grouped = new Map<string, RecordDocumentFile[]>();

    filteredDocuments.forEach((document) => {
      const key =
        document.documentFolder && configuredSlugs.has(document.documentFolder)
          ? document.documentFolder
          : "__unfiled";
      grouped.set(key, [...(grouped.get(key) ?? []), document]);
    });

    return grouped;
  }, [configuredSlugs, filteredDocuments]);
  const unfiledDocuments = documentsByFolder.get("__unfiled") ?? [];
  const visibleFolders = useMemo(
    () =>
      folders.filter(
        (folder) => (documentsByFolder.get(folder.slug)?.length ?? 0) > 0,
      ),
    [documentsByFolder, folders],
  );
  const refreshableSignatureCount =
    refreshableSignatureRequestCount(signatureRequests);
  const pendingSignatureCount = pendingSignatureRequestCount(signatureRequests);
  const tabItems: Array<{
    count?: number;
    icon: typeof FileText;
    key: DocumentLibraryTab;
    label: string;
  }> = [
    {
      count: documents.length,
      icon: FileText,
      key: "files",
      label: "Library",
    },
    {
      icon: UploadCloud,
      key: "upload",
      label: "Upload files",
    },
    {
      count: openUploadRequestCount(uploadRequests),
      icon: Link2,
      key: "requests",
      label: "Request files",
    },
    {
      count:
        openDocumentPortalCount(documentPortals) +
        openDocumentShareCount(documentShares),
      icon: Share2,
      key: "sent",
      label: "Send to customer",
    },
    {
      count: pendingSignatureCount,
      icon: PenLine,
      key: "signatures",
      label: "Signatures",
    },
  ];

  const clearSelectedFiles = useCallback(() => {
    setSelectedFileIds([]);
  }, [setSelectedFileIds]);

  const openSentDocuments = useCallback(() => {
    setActiveTab("sent");
  }, [setActiveTab]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFileIds((current) =>
      current.includes(fileId)
        ? current.filter((selectedFileId) => selectedFileId !== fileId)
        : [...current, fileId],
    );
  }, [setSelectedFileIds]);

  const selectFilteredDocuments = useCallback(() => {
    setSelectedFileIds((current) => {
      const next = new Set(current);

      filteredDocumentIds.forEach((fileId) => next.add(fileId));

      return Array.from(next);
    });
  }, [filteredDocumentIds, setSelectedFileIds]);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800 dark:text-white/90">
            Documents
            <LazyHelpTooltip content="This library stores record documents in configured folders. Use Library for stored files, Upload files for staff uploads, Request files for customer uploads, Send to customer for outbound links and Signatures for DocuSign tracking." />
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {entityLabel} · {documents.length} document
            {documents.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="inline-flex h-8 items-center rounded-md bg-gray-50 px-2.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800">
              {folders.length} folders
            </span>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <UploadCloud className="h-3.5 w-3.5" />
              Upload
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <Link2 className="h-3.5 w-3.5" />
              Request files
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("sent")}
              disabled={!activeSelectedFileIds.length}
              title={
                activeSelectedFileIds.length
                  ? "Send selected documents"
                  : "Select files in Library before sending files"
              }
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              <Send className="h-3.5 w-3.5" />
              Send files
            </button>
          </div>
          {!activeSelectedFileIds.length ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-right">
              Select files in Library before sending files.
            </p>
          ) : null}
          <SignatureStatusRefreshButton
            entityId={entityId}
            entityType={entityType}
            requestCount={refreshableSignatureCount}
          />
        </div>
      </div>

      {!uploadPolicy.isConfigured ? (
        <p className="mt-4 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
          Cloudflare R2 must be connected before documents can be uploaded.
        </p>
      ) : null}

      <DocumentLibraryOverview
        documentPortals={documentPortals}
        documentShares={documentShares}
        documents={documents}
        selectedCount={activeSelectedFileIds.length}
        signatureRequests={signatureRequests}
        uploadRequests={uploadRequests}
      />

      <SelectedDocumentTray
        documents={selectedDocuments}
        onClear={clearSelectedFiles}
        onSend={openSentDocuments}
      />

      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="overflow-x-auto">
          <div
            aria-label="Document library sections"
            className="inline-flex min-w-full gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-gray-950/30 sm:min-w-0"
          >
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex h-10 min-w-[8rem] flex-1 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold transition sm:flex-none ${
                    isActive
                      ? "bg-white text-brand-600 shadow-theme-xs ring-1 ring-gray-200 dark:bg-gray-900 dark:text-brand-300 dark:ring-gray-800"
                      : "text-gray-600 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-gray-200"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {typeof tab.count === "number" ? (
                    <span
                      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs ${
                        isActive
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-200"
                          : "bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800"
                      }`}
                    >
                      {tab.count.toLocaleString("en-GB")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "files" ? (
          <div
            id="document-library-files-panel"
            className="mt-4"
          >
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
              <div className="relative">
                <label
                  className="sr-only"
                  htmlFor="document-library-search"
                >
                  Search documents
                </label>
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  id="document-library-search"
                  type="search"
                  value={documentQuery}
                  onChange={(event) => {
                    setDocumentQuery(event.target.value);
                    setSelectedFileIds([]);
                  }}
                  placeholder="Search documents by name, type, notes or tag"
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 pl-10 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                />
              </div>
              <label className="block">
                <span className="sr-only">Filter document type</span>
                <select
                  value={typeFilter}
                  onChange={(event) => {
                    setTypeFilter(event.target.value);
                    setSelectedFileIds([]);
                  }}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                >
                  <option value="all">All file types</option>
                  <option value="image">Images</option>
                  <option value="pdf">PDFs</option>
                  <option value="text">Text files</option>
                  <option value="document">Documents</option>
                  <option value="spreadsheet">Spreadsheets</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
            <BulkDocumentActions
              entityId={entityId}
              entityType={entityType}
              filteredDocumentCount={filteredDocuments.length}
              folders={folders}
              onClearSelection={clearSelectedFiles}
              onSelectFiltered={selectFilteredDocuments}
              selectedFileIds={activeSelectedFileIds}
              selectedFilteredCount={selectedFilteredCount}
            />

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {visibleFolders.map((folder, index) => {
                const files = documentsByFolder.get(folder.slug) ?? [];

                return (
                  <details
                    key={folder.slug}
                    open={index === 0}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderClosed className="h-4 w-4 shrink-0 text-brand-500" />
                        <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                          {folder.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                          {files.length}
                        </span>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </span>
                    </summary>
                    <div className="mt-3">
                      <DocumentList
                        entityId={entityId}
                        entityType={entityType}
                        files={files}
                        onToggleFile={toggleFileSelection}
                        selectedFileIds={selectedFileIdSet}
                        signatureRequests={signatureRequests}
                      />
                    </div>
                  </details>
                );
              })}

              {unfiledDocuments.length ? (
                <details
                  open={!visibleFolders.length}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <FolderClosed className="h-4 w-4 shrink-0 text-gray-500" />
                      <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                        Unfiled documents
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                        {unfiledDocuments.length}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </span>
                  </summary>
                  <div className="mt-3">
                    <DocumentList
                      entityId={entityId}
                      entityType={entityType}
                      files={unfiledDocuments}
                      onToggleFile={toggleFileSelection}
                      selectedFileIds={selectedFileIdSet}
                      signatureRequests={signatureRequests}
                    />
                  </div>
                </details>
              ) : null}
              {!filteredDocuments.length && documents.length ? (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No documents match this search.
                </p>
              ) : null}
              {!documents.length ? (
                <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No documents yet.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === "upload" ? (
          <div id="document-library-upload-panel" className="mt-4">
            <AutoFileUploadForm
              entityId={entityId}
              entityType={entityType}
              uploadPolicy={uploadPolicy}
            />
          </div>
        ) : null}

        {activeTab === "requests" ? (
          <div id="document-library-requests-panel" className="mt-4">
            <CustomerUploadRequestPanel
              entityId={entityId}
              entityType={entityType}
              uploadPolicy={uploadPolicy}
              uploadRequests={uploadRequests}
            />
          </div>
        ) : null}

        {activeTab === "sent" ? (
          <div id="document-library-sent-panel" className="mt-4">
            <SendToCustomerPanel
              documentPortals={documentPortals}
              documentShares={documentShares}
              entityId={entityId}
              entityLabel={entityLabel}
              entityType={entityType}
              selectedDocuments={selectedDocuments}
              selectedFileIds={activeSelectedFileIds}
              signatureRequests={signatureRequests}
              uploadPolicy={uploadPolicy}
            />
          </div>
        ) : null}

        {activeTab === "signatures" ? (
          <div id="document-library-signatures-panel" className="mt-4">
            <SignatureRequestsPanel
              documents={documents}
              signatureRequests={signatureRequests}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

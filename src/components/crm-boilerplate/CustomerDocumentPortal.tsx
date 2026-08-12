import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  FileText,
  UploadCloud,
} from "lucide-react";
import { CustomerLinkGuidance } from "@/components/crm-boilerplate/CustomerLinkGuidance";
import {
  ChecklistUploadForm,
  type CustomerUploadPortalItem,
  type CustomerUploadPortalProps,
} from "@/components/crm-boilerplate/CustomerUploadPortal";

export type CustomerDocumentPortalFile = {
  fileAssetId: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
};

export type CustomerDocumentPortalSignatureRequest = {
  certificateFileAssetId: string | null;
  certificateName: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  deliveredAt: string | null;
  id: string;
  recipients: Array<{
    email: string;
    name: string;
    status: string;
  }>;
  sentAt: string | null;
  signedFileAssetId: string | null;
  signedFileName: string | null;
  status: string;
  subject: string;
};

export type CustomerDocumentPortalProps = {
  expiresAt: string;
  isOpen: boolean;
  message: string | null;
  recipientName: string | null;
  sharedFiles: CustomerDocumentPortalFile[];
  signatureRequests: CustomerDocumentPortalSignatureRequest[];
  token: string;
  uploadCanRemoveFiles: boolean;
  uploadItems: CustomerUploadPortalItem[];
  uploadIsOpen: boolean;
  uploadPolicy: CustomerUploadPortalProps["uploadPolicy"];
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
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

function signatureStatusLabel(status: string) {
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

  return "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40";
}

function signatureDate(request: CustomerDocumentPortalSignatureRequest) {
  return (
    request.completedAt ??
    request.declinedAt ??
    request.deliveredAt ??
    request.sentAt
  );
}

function completedUploadCount(items: CustomerUploadPortalItem[]) {
  return items.filter((item) => item.fulfilledAt || item.fileCount > 0).length;
}

function completedSignatureCount(
  requests: CustomerDocumentPortalSignatureRequest[],
) {
  return requests.filter((request) => request.status === "COMPLETED").length;
}

function failedSignatureCount(
  requests: CustomerDocumentPortalSignatureRequest[],
) {
  return requests.filter((request) =>
    ["DECLINED", "ERROR", "EXPIRED", "VOIDED"].includes(request.status),
  ).length;
}

function PortalProgressSummary({
  sharedFileCount,
  signatureRequests,
  uploadIsOpen,
  uploadItems,
  uploadPolicy,
}: {
  sharedFileCount: number;
  signatureRequests: CustomerDocumentPortalSignatureRequest[];
  uploadIsOpen: boolean;
  uploadItems: CustomerUploadPortalItem[];
  uploadPolicy: CustomerDocumentPortalProps["uploadPolicy"];
}) {
  const uploadsDone = completedUploadCount(uploadItems);
  const signaturesDone = completedSignatureCount(signatureRequests);
  const signaturesFailed = failedSignatureCount(signatureRequests);
  const requiredTotal = uploadItems.length + signatureRequests.length;
  const requiredComplete = uploadsDone + signaturesDone;
  const hasOpenUploads = uploadItems.length > 0;
  const uploadBlocked =
    hasOpenUploads && (!uploadIsOpen || !uploadPolicy.isConfigured);
  const allRequiredComplete =
    requiredTotal > 0 &&
    requiredComplete === requiredTotal &&
    signaturesFailed === 0;
  const progressPercent = requiredTotal
    ? Math.round((requiredComplete / requiredTotal) * 100)
    : 100;

  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            What needs doing
          </h2>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {requiredTotal
              ? allRequiredComplete
                ? "All required document tasks are complete."
                : `${requiredComplete} of ${requiredTotal} required item${requiredTotal === 1 ? "" : "s"} complete.`
              : sharedFileCount
                ? "Files are available for you to review."
                : "There are no document tasks at the moment."}
          </p>
        </div>
        {requiredTotal ? (
          <span
            className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ring-1 ${
              allRequiredComplete
                ? "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40"
                : uploadBlocked || signaturesFailed
                  ? "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40"
                  : "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40"
            }`}
          >
            {progressPercent}% complete
          </span>
        ) : null}
      </div>

      {requiredTotal ? (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className={`h-full rounded-full ${
              allRequiredComplete ? "bg-success-500" : "bg-brand-500"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ProgressStep
          actionHref={sharedFileCount ? "#shared-documents" : undefined}
          actionLabel="Review files"
          detail={
            sharedFileCount
              ? `${sharedFileCount} file${sharedFileCount === 1 ? "" : "s"} available to download.`
              : "No files have been shared yet."
          }
          Icon={Download}
          label="Review shared files"
          status={sharedFileCount ? "Available" : "Not needed"}
          tone={sharedFileCount ? "brand" : "neutral"}
        />
        <ProgressStep
          actionHref={uploadItems.length ? "#requested-uploads" : undefined}
          actionLabel="Go to uploads"
          detail={
            uploadItems.length
              ? uploadBlocked
                ? "Uploads are currently unavailable. Please contact the team."
                : uploadsDone === uploadItems.length
                  ? "All requested files have been uploaded."
                  : `${uploadItems.length - uploadsDone} upload${uploadItems.length - uploadsDone === 1 ? "" : "s"} still needed.`
              : "No uploads are currently requested."
          }
          Icon={UploadCloud}
          label="Upload requested files"
          status={
            uploadItems.length
              ? uploadBlocked
                ? "Unavailable"
                : uploadsDone === uploadItems.length
                  ? "Complete"
                  : "Action needed"
              : "Not needed"
          }
          tone={
            uploadItems.length
              ? uploadBlocked
                ? "warning"
                : uploadsDone === uploadItems.length
                  ? "success"
                  : "brand"
              : "neutral"
          }
        />
        <ProgressStep
          actionHref={signatureRequests.length ? "#signature-status" : undefined}
          actionLabel="View status"
          detail={
            signatureRequests.length
              ? signaturesFailed
                ? `${signaturesFailed} signature request${signaturesFailed === 1 ? "" : "s"} need attention.`
                : signaturesDone === signatureRequests.length
                  ? "All signature requests are complete."
                  : `${signatureRequests.length - signaturesDone} signature${signatureRequests.length - signaturesDone === 1 ? "" : "s"} still pending.`
              : "No signatures are currently requested."
          }
          Icon={FileSignature}
          label="Signature status"
          status={
            signatureRequests.length
              ? signaturesFailed
                ? "Needs attention"
                : signaturesDone === signatureRequests.length
                  ? "Complete"
                  : "Action needed"
              : "Not needed"
          }
          tone={
            signatureRequests.length
              ? signaturesFailed
                ? "warning"
                : signaturesDone === signatureRequests.length
                  ? "success"
                  : "brand"
              : "neutral"
          }
        />
      </div>
    </section>
  );
}

function ProgressStep({
  actionHref,
  actionLabel,
  detail,
  Icon,
  label,
  status,
  tone,
}: {
  actionHref?: string;
  actionLabel?: string;
  detail: string;
  Icon: typeof Download;
  label: string;
  status: string;
  tone: "brand" | "neutral" | "success" | "warning";
}) {
  const toneClasses = {
    brand:
      "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40",
    neutral:
      "bg-gray-50 text-gray-600 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800",
    success:
      "bg-success-50 text-success-700 ring-success-200 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40",
    warning:
      "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40",
  }[tone];

  return (
    <article className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClasses}`}
        >
          {tone === "warning" ? (
            <AlertCircle className="h-5 w-5" />
          ) : tone === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">
            {label}
          </span>
          <span className="mt-1 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800">
            {status}
          </span>
          <span className="mt-2 block text-xs leading-5 text-gray-500 dark:text-gray-400">
            {detail}
          </span>
          {actionHref && actionLabel ? (
            <a
              href={actionHref}
              className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              {actionLabel}
            </a>
          ) : null}
        </span>
      </div>
    </article>
  );
}

export default function CustomerDocumentPortal({
  expiresAt,
  isOpen,
  message,
  recipientName,
  sharedFiles,
  signatureRequests,
  token,
  uploadCanRemoveFiles,
  uploadIsOpen,
  uploadItems,
  uploadPolicy,
}: CustomerDocumentPortalProps) {
  const hasRequiredTasks = uploadItems.length > 0 || signatureRequests.length > 0;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 text-gray-800 dark:bg-gray-950 dark:text-white/90">
      <div className="mx-auto max-w-4xl">
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Secure document portal
              </h1>
              <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {recipientName ? `${recipientName}, view` : "View"} documents,
                upload requested files and check signature progress from one
                secure link.
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

          {message ? (
            <p className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm leading-6 text-brand-800 dark:border-brand-900/40 dark:bg-brand-900/10 dark:text-brand-200">
              {message}
            </p>
          ) : null}
        </section>

        <PortalProgressSummary
          sharedFileCount={sharedFiles.length}
          signatureRequests={signatureRequests}
          uploadIsOpen={uploadIsOpen}
          uploadItems={uploadItems}
          uploadPolicy={uploadPolicy}
        />

        <CustomerLinkGuidance
          summary={
            hasRequiredTasks
              ? "Use this secure page to complete any outstanding document tasks for your project."
              : "Use this secure page to review the documents shared with you."
          }
          steps={[
            "Start with the What needs doing summary, then use the buttons to jump to the right section.",
            "Download any shared files you need to review or keep for your records.",
            "Upload requested documents or check signature progress where those tasks are listed.",
          ]}
          note={`This private portal only shows files and tasks linked to this request. It expires on ${formatDateTime(expiresAt)}; if you need more time, reply to the email you received and we can issue a new link.`}
        />

        {sharedFiles.length ? (
          <section
            id="shared-documents"
            className="mt-4 scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
          >
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Download className="h-4 w-4 text-brand-500" />
              Documents shared with you
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Download these files to review, save or share with anyone helping
              you respond.
            </p>
            <div className="mt-4 space-y-3">
              {sharedFiles.map((file) => (
                <a
                  key={file.fileAssetId}
                  href={`/api/document-portals/${encodeURIComponent(token)}/files/${encodeURIComponent(file.fileAssetId)}`}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-gray-950/30 dark:hover:border-brand-900/50 dark:hover:bg-brand-900/10"
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                    <FileText className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold text-gray-900 dark:text-white">
                      {file.name}
                    </span>
                    <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                      {fileTypeLabel(file.mimeType)} ·{" "}
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </span>
                  <span className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-brand-100 bg-brand-50 px-3 text-xs font-semibold text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300">
                    <Download className="h-4 w-4" />
                    Download
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {uploadItems.length ? (
          <section id="requested-uploads" className="mt-4 scroll-mt-6">
            <div className="mb-3 flex items-center gap-2 px-1">
              <UploadCloud className="h-4 w-4 text-brand-500" />
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Documents requested from you
              </h2>
            </div>
            <p className="mb-3 px-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Upload clear copies of the files listed here. Once uploaded, the
              team is notified and can review the next step.
            </p>
            {!uploadPolicy.isConfigured ? (
              <p className="mb-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-800 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-200">
                Document uploads are temporarily unavailable.
              </p>
            ) : null}
            <div className="space-y-3">
              {uploadItems.map((item) => (
                <ChecklistUploadForm
                  canRemoveFiles={uploadCanRemoveFiles}
                  key={item.id}
                  isOpen={uploadIsOpen}
                  item={item}
                  token={token}
                  uploadPolicy={uploadPolicy}
                />
              ))}
            </div>
          </section>
        ) : null}

        {signatureRequests.length ? (
          <section
            id="signature-status"
            className="mt-4 scroll-mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
          >
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <FileSignature className="h-4 w-4 text-brand-500" />
              Signature status
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Signature requests are sent through DocuSign. If a document has
              already been completed, you can download the signed copy here.
            </p>
            <div className="mt-4 space-y-3">
              {signatureRequests.map((request) => {
                const date = signatureDate(request);
                const recipient = request.recipients[0];

                return (
                  <article
                    key={request.id}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-semibold ring-1 ${signatureStatusClassName(request.status)}`}
                          >
                            {signatureStatusLabel(request.status)}
                          </span>
                          {date ? (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDateTime(date)}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                          {request.subject}
                        </p>
                        {recipient ? (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {recipient.name || recipient.email}
                          </p>
                        ) : null}
                      </div>
                      {request.status === "COMPLETED" ? (
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
                      ) : null}
                    </div>
                    {request.signedFileAssetId ||
                    request.certificateFileAssetId ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {request.signedFileAssetId ? (
                          <a
                            href={`/api/document-portals/${encodeURIComponent(token)}/files/${encodeURIComponent(request.signedFileAssetId)}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                          >
                            <Download className="h-4 w-4" />
                            Signed document
                          </a>
                        ) : null}
                        {request.certificateFileAssetId ? (
                          <a
                            href={`/api/document-portals/${encodeURIComponent(token)}/files/${encodeURIComponent(request.certificateFileAssetId)}`}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                          >
                            <Download className="h-4 w-4" />
                            Certificate
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

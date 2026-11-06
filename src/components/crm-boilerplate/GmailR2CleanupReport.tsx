"use client";

import { useActionState } from "react";
import {
  generateGmailR2CleanupReportAction,
  type GmailR2CleanupReport,
  type GmailR2CleanupReportState,
} from "@/lib/actions/gmail-r2-cleanup";

const initialState: GmailR2CleanupReportState = {
  generatedAt: null,
  message: "",
  ok: false,
  report: null,
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  })} ${units[unitIndex]}`;
}

function MetricCard({
  detail,
  label,
  tone = "default",
  value,
}: {
  detail: string;
  label: string;
  tone?: "default" | "success" | "warning";
  value: string;
}) {
  const valueClass =
    tone === "success"
      ? "text-success-600 dark:text-success-400"
      : tone === "warning"
        ? "text-warning-600 dark:text-warning-400"
        : "text-gray-900 dark:text-white";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <p className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </div>
  );
}

function ProtectionRow({
  bytes,
  count,
  description,
  label,
}: {
  bytes: number;
  count: number;
  description: string;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-white/90">
          {label}
        </p>
        <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {count.toLocaleString()} · {formatBytes(bytes)}
      </p>
    </div>
  );
}

function CleanupResults({ report }: { report: GmailR2CleanupReport }) {
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Potential files"
          value={report.wouldRemoveFiles.toLocaleString()}
          detail={`${report.providerBackedFiles.toLocaleString()} provider-backed · ${report.orphanFiles.toLocaleString()} orphaned`}
          tone="warning"
        />
        <MetricCard
          label="Potential saving"
          value={formatBytes(report.wouldRemoveBytes)}
          detail="Estimate before provider verification and final rescan"
          tone="success"
        />
        <MetricCard
          label="Attachment links"
          value={report.wouldDetachAttachments.toLocaleString()}
          detail="References that would return to provider-hosted access"
        />
        <MetricCard
          label="Retryable deletions"
          value={report.retryableFiles.toLocaleString()}
          detail={`${formatBytes(report.retryableBytes)} remains tagged after an earlier R2 failure`}
          tone={report.retryableFiles ? "warning" : "default"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Protected storage
          </h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            These files are excluded automatically and are not cleanup candidates.
          </p>
          <div className="mt-2">
            <ProtectionRow
              label="Saved deliberately"
              count={report.explicitlySavedFiles}
              bytes={report.explicitlySavedBytes}
              description="A CRM user selected Save to CRM or owns the stored file."
            />
            <ProtectionRow
              label="Used elsewhere in CRM"
              count={report.protectedFiles}
              bytes={report.protectedBytes}
              description="The file is linked to another document, product, signature or upload workflow."
            />
            <ProtectionRow
              label="Provider unavailable"
              count={report.providerUnavailableFiles}
              bytes={report.providerUnavailableBytes}
              description="Gmail retrieval metadata, mailbox access or a provider attachment is unavailable."
            />
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Last applied cleanup
          </h4>
          {report.lastApply ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(report.lastApply.appliedAt).toLocaleString()}
              </p>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-500">Removed</dt>
                  <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                    {report.lastApply.removedFiles.toLocaleString()} · {formatBytes(report.lastApply.removedBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Detached links</dt>
                  <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                    {report.lastApply.detachedAttachments.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Verification failures</dt>
                  <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                    {report.lastApply.providerVerificationFailures.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">R2 delete failures</dt>
                  <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                    {report.lastApply.failedObjectDeletes.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Changed during rescan</dt>
                  <dd className="mt-1 font-semibold text-gray-800 dark:text-white/90">
                    {report.lastApply.skippedAfterRescan.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
              No applied Gmail legacy cleanup has been recorded. Provider verification and deletion failure counts will appear here after an approved maintenance run.
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Candidate preview
          </h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Showing up to 25 opaque file references. R2 object keys and customer content are never exposed.
          </p>
        </div>
        {report.candidateFilesPreview.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm dark:divide-gray-800">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase dark:bg-white/[0.02] dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Size</th>
                  <th className="px-4 py-3 font-medium">Attachment links</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {report.candidateFilesPreview.map((candidate, index) => (
                  <tr key={`${candidate.fileIdPrefix ?? "file"}-${index}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {candidate.fileIdPrefix ?? "unknown"}…
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {formatBytes(candidate.sizeBytes)}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {candidate.attachmentLinks.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
            No eligible legacy Gmail files were found.
          </p>
        )}
      </section>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Scanned {report.gmailFilesScanned.toLocaleString()} Gmail-tagged files at {new Date(report.generatedAt).toLocaleString()}. Estimates can fall during an approved cleanup because every candidate is checked again and provider bytes must match before removal.
      </p>
    </div>
  );
}

export default function GmailR2CleanupReport() {
  const [state, formAction, isPending] = useActionState(
    generateGmailR2CleanupReportAction,
    initialState,
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Legacy Gmail storage report
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
            Inspect automatically archived Gmail files, estimated R2 savings and protection reasons before a separately approved maintenance run.
          </p>
          <p className="mt-2 text-xs font-medium text-success-600 dark:text-success-400">
            Report only — running this scan cannot detach or delete files.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
          >
            {isPending ? "Scanning…" : state.report ? "Refresh safe scan" : "Run safe scan"}
          </button>
        </form>
      </div>

      {state.message ? (
        <p
          role="status"
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-400"
              : "bg-error-50 text-error-700 dark:bg-error-500/10 dark:text-error-400"
          }`}
        >
          {state.message}
        </p>
      ) : null}

      {state.report ? <CleanupResults report={state.report} /> : null}
    </div>
  );
}

"use client";

import { Upload } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import { Modal } from "@/components/ui/modal";
import { useModal } from "@/hooks/useModal";
import {
  importContactsAction,
  previewContactImportAction,
  type ContactImportPreviewRow,
  type ContactImportState,
} from "@/lib/actions/contact-import";
import {
  contactImportTemplateCsv,
  type ContactImportType,
} from "@/lib/contacts/import";
import { toCsv } from "@/lib/csv";

const initialState: ContactImportState = { ok: false, message: "" };

function statusClass(status: ContactImportPreviewRow["status"]) {
  if (status === "CREATE") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (status === "SKIP") {
    return "bg-warning-50 text-warning-800 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

export default function ContactImportModal({
  contactTypes,
}: {
  contactTypes: ContactImportType[];
}) {
  const modal = useModal();
  const router = useRouter();
  const { showToast } = useToast();
  const previewFormRef = useRef<HTMLFormElement>(null);
  const [confirmedPayload, setConfirmedPayload] = useState("");
  const [preview, previewAction, previewPending] = useActionState(
    previewContactImportAction,
    initialState,
  );
  const [result, importAction, importPending] = useActionState(
    importContactsAction,
    initialState,
  );
  const templateHref = useMemo(
    () =>
      `data:text/csv;charset=utf-8,${encodeURIComponent(
        contactImportTemplateCsv(contactTypes),
      )}`,
    [contactTypes],
  );
  const issueRows = useMemo(
    () => preview.rows?.filter((row) => row.status !== "CREATE") ?? [],
    [preview.rows],
  );
  const issueHref = useMemo(() => {
    if (!issueRows.length) return "";
    return `data:text/csv;charset=utf-8,${encodeURIComponent(
      toCsv([
        ["Row", "Person type", "First name", "Last name", "Email", "Status", "Message"],
        ...issueRows.map((row) => [
          row.rowNumber,
          row.personType,
          row.firstName,
          row.lastName,
          row.email ?? "",
          row.status,
          row.message,
        ]),
      ]),
    )}`;
  }, [issueRows]);
  const confirmed = Boolean(
    preview.importPayload && confirmedPayload === preview.importPayload,
  );

  useEffect(() => {
    if (!result.ok) return;
    showToast(result.message || "People imported.");
    previewFormRef.current?.reset();
    router.refresh();
    modal.closeModal();
  }, [modal, result.message, result.ok, router, showToast]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={modal.openModal}
        startIcon={<Upload className="h-4 w-4" />}
      >
        Import CSV
      </Button>
      <Modal
        isOpen={modal.isOpen}
        onClose={modal.closeModal}
        className="relative m-5 w-full max-w-[1040px] rounded-3xl bg-white p-6 dark:bg-gray-900 sm:m-0 lg:p-8"
      >
        <div className="pr-10">
          <h2 className="text-title-xs font-semibold text-gray-800 dark:text-white/90">
            Import people from CSV
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Preview every row before creating records. Existing email addresses
            or phone numbers are skipped; this importer never overwrites people.
          </p>
        </div>

        <div className="mt-6 space-y-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-800 dark:bg-white/[0.02]">
            <p className="font-semibold text-gray-800 dark:text-white/90">
              Person types and custom fields
            </p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Use the person-type slug shown in the template. Custom columns use
              <code className="mx-1 rounded bg-white px-1 py-0.5 dark:bg-gray-900">
                custom:field_key
              </code>
              and multi-select values use a vertical bar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {contactTypes.map((type) => (
                <span
                  key={type.id}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700"
                >
                  {type.name}: {type.slug}
                </span>
              ))}
            </div>
          </div>

          <form
            ref={previewFormRef}
            action={previewAction}
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                CSV file
              </span>
              <input
                name="contactCsv"
                type="file"
                accept=".csv,text/csv"
                required
                className="block h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 file:mr-4 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-brand-600 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:file:text-brand-400"
              />
            </label>
            <a
              href={templateHref}
              download="epc-people-import-template.csv"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
            >
              Download template
            </a>
            <button
              type="submit"
              disabled={previewPending}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {previewPending ? "Checking..." : "Preview import"}
            </button>
          </form>

          <ActionStateMessage state={preview.message ? preview : undefined} />

          {preview.rows?.length ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
              <div className="grid grid-cols-2 divide-x divide-gray-200 bg-gray-50 sm:grid-cols-4 dark:divide-gray-800 dark:bg-white/[0.02]">
                <Metric label="Ready" value={preview.readyCount ?? 0} />
                <Metric label="Skipped" value={preview.skipped ?? 0} />
                <Metric label="Errors" value={preview.errors ?? 0} />
                <Metric label="Rows" value={preview.totalRows ?? 0} />
              </div>
              {issueRows.length ? (
                <div className="border-t border-gray-200 p-3 dark:border-gray-800">
                  <a
                    href={issueHref}
                    download="epc-people-import-issues.csv"
                    className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Download skipped/error report
                  </a>
                </div>
              ) : null}
              <div className="max-h-80 overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-950">
                    <tr className="text-left text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                      <th className="px-4 py-3">Row</th>
                      <th className="px-4 py-3">Person</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {preview.rows.map((row) => (
                      <tr key={`${row.rowNumber}-${row.status}`} className="text-sm text-gray-700 dark:text-gray-300">
                        <td className="px-4 py-3">{row.rowNumber}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800 dark:text-white/90">
                            {[row.firstName, row.lastName].filter(Boolean).join(" ") || "Missing name"}
                          </p>
                          <p className="text-xs text-gray-500">{row.email ?? "No email"}</p>
                        </td>
                        <td className="px-4 py-3">{row.personType || "Not set"}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                            {row.status === "CREATE" ? "Create" : row.status === "SKIP" ? "Skip" : "Error"}
                          </span>
                        </td>
                        <td className="px-4 py-3">{row.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {preview.importPayload && preview.readyCount ? (
            <form action={importAction} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
              <input type="hidden" name="importPayload" value={preview.importPayload} />
              <label className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) =>
                    setConfirmedPayload(event.target.checked ? preview.importPayload ?? "" : "")
                  }
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500"
                />
                I have reviewed the preview and want to create {preview.readyCount} person{preview.readyCount === 1 ? "" : "s"}. Existing records will not be changed.
              </label>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={!confirmed || importPending}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                >
                  {importPending ? "Importing..." : "Import validated people"}
                </button>
              </div>
              <ActionStateMessage state={result.message && !result.ok ? result : undefined} />
            </form>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

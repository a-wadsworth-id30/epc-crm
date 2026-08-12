"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import {
  importBulkUsersAction,
  previewBulkUserImportAction,
  type BulkUserImportPreviewRow,
  type BulkUserImportState,
} from "@/lib/actions/auth";
import { bulkUserImportTemplateCsv } from "@/lib/users/bulk-user-import";
import { getUserRoleTemplate } from "@/lib/users/role-templates";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";

const initialBulkImportState: BulkUserImportState = {
  ok: false,
  message: "",
};

function statusClass(status: BulkUserImportPreviewRow["status"]) {
  if (status === "CREATE") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }

  if (status === "SKIP") {
    return "bg-warning-50 text-warning-800 dark:bg-warning-900/20 dark:text-warning-300";
  }

  return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
}

function statusLabel(status: BulkUserImportPreviewRow["status"]) {
  if (status === "CREATE") return "Create";
  if (status === "SKIP") return "Skip";
  return "Error";
}

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function issueReportCsv(rows: BulkUserImportPreviewRow[]) {
  const header = [
    "rowNumber",
    "email",
    "firstName",
    "lastName",
    "role",
    "roleTemplate",
    "status",
    "message",
  ];
  const body = rows.map((row) =>
    [
      row.rowNumber,
      row.email,
      row.firstName,
      row.lastName,
      row.role,
      row.roleTemplate ?? "",
      row.status,
      row.message,
    ]
      .map(csvCell)
      .join(","),
  );

  return [header.join(","), ...body].join("\n");
}

export default function UserBulkImportPanel() {
  const previewFormRef = useRef<HTMLFormElement>(null);
  const { showToast } = useToast();
  const [confirmedAdminPayload, setConfirmedAdminPayload] = useState("");
  const [previewState, previewAction, isPreviewPending] = useActionState(
    previewBulkUserImportAction,
    initialBulkImportState,
  );
  const [importState, importAction, isImportPending] = useActionState(
    importBulkUsersAction,
    initialBulkImportState,
  );
  const templateHref = useMemo(
    () =>
      `data:text/csv;charset=utf-8,${encodeURIComponent(
        bulkUserImportTemplateCsv,
      )}`,
    [],
  );
  const issueRows = useMemo(
    () =>
      previewState.rows?.filter((row) => row.status !== "CREATE") ?? [],
    [previewState.rows],
  );
  const issueReportHref = useMemo(
    () =>
      issueRows.length
        ? `data:text/csv;charset=utf-8,${encodeURIComponent(
            issueReportCsv(issueRows),
          )}`
        : "",
    [issueRows],
  );
  const adminReadyCount =
    previewState.adminCount ??
    previewState.rows?.filter(
      (row) => row.status === "CREATE" && row.role === "ADMIN",
    ).length ??
    0;

  useEffect(() => {
    if (!importState.ok) {
      return;
    }

    previewFormRef.current?.reset();
    showToast(importState.message || "Users imported.");
  }, [importState.message, importState.ok, showToast]);

  const adminConfirmed = Boolean(
    previewState.importPayload &&
      confirmedAdminPayload === previewState.importPayload,
  );
  const canImport = Boolean(
    previewState.importPayload &&
      previewState.readyCount &&
      (adminReadyCount === 0 || adminConfirmed),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 border-b border-gray-200 p-5 sm:flex-row sm:items-start sm:justify-between dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Bulk user import
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            Upload a CSV to create user accounts in bulk. Passwords are not
            imported; each user receives a secure setup link.
          </p>
        </div>
        <a
          href={templateHref}
          download="id30-user-import-template.csv"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Download CSV template
        </a>
      </div>

      <div className="space-y-5 p-5">
        <form
          ref={previewFormRef}
          action={previewAction}
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <div>
            <label
              htmlFor="bulk-user-csv"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              CSV file
            </label>
            <input
              id="bulk-user-csv"
              name="userCsv"
              type="file"
              accept=".csv,text/csv"
              required
              className="block h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 file:mr-4 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-brand-600 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/10 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:file:text-brand-400"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Columns: email, firstName, lastName, roleTemplate, mobile,
              landline. Existing role columns still work with USER or ADMIN.
            </p>
          </div>
          <button
            type="submit"
            disabled={isPreviewPending}
            className="inline-flex h-11 items-center justify-center self-end rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPreviewPending ? "Checking..." : "Preview import"}
          </button>
        </form>

        <ActionStateMessage
          state={previewState.message ? previewState : undefined}
        />

        {previewState.rows?.length ? (
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            <div className="grid gap-0 divide-y divide-gray-100 bg-gray-50 text-sm dark:divide-gray-800 dark:bg-white/[0.02] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              <ImportMetric
                label="Ready"
                value={String(previewState.readyCount ?? 0)}
              />
              <ImportMetric
                label="Skipped"
                value={String(previewState.skipped ?? 0)}
              />
              <ImportMetric
                label="Errors"
                value={String(previewState.errors ?? 0)}
              />
              <ImportMetric
                label="CSV rows"
                value={String(previewState.totalRows ?? 0)}
              />
            </div>
            {issueRows.length ? (
              <div className="border-t border-gray-200 p-4 dark:border-gray-800">
                <a
                  href={issueReportHref}
                  download="id30-user-import-issues.csv"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
                >
                  Download skipped/error report
                </a>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-white/[0.02]">
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                    <th className="px-5 py-3">Row</th>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {previewState.rows.map((row) => (
                    <tr
                      key={`${row.rowNumber}-${row.email}-${row.status}`}
                      className="text-sm text-gray-700 dark:text-gray-300"
                    >
                      <td className="px-5 py-4">{row.rowNumber}</td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-800 dark:text-white/90">
                          {row.name || "Missing name"}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {row.email || "Missing email"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div>{row.role}</div>
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {getUserRoleTemplate(row.roleTemplate)?.label ??
                            "No template"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            row.status,
                          )}`}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4">{row.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {previewState.rows?.length ? (
          <form
            action={importAction}
            className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.02]"
          >
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                Import validated users
              </p>
              {adminReadyCount > 0 ? (
                <div className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/15 dark:text-warning-200">
                  This import will create {adminReadyCount} admin account
                  {adminReadyCount === 1 ? "" : "s"}. Admin users can manage
                  settings, integrations and other users.
                </div>
              ) : null}
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  name="sendSetupEmails"
                  defaultChecked
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700"
                />
                Send password setup emails
              </label>
              {adminReadyCount > 0 ? (
                <label className="mt-2 flex items-center gap-2 text-sm font-medium text-warning-800 dark:text-warning-200">
                  <input
                    type="checkbox"
                    name="confirmAdminImport"
                    checked={adminConfirmed}
                    onChange={(event) =>
                      setConfirmedAdminPayload(
                        event.target.checked
                          ? (previewState.importPayload ?? "")
                          : "",
                      )
                    }
                    className="h-4 w-4 rounded border-warning-300 text-brand-500 focus:ring-brand-500 dark:border-warning-800"
                  />
                  I understand this will create admin accounts.
                </label>
              ) : null}
            </div>
            <input
              type="hidden"
              name="importPayload"
              value={previewState.importPayload ?? ""}
            />
            <button
              type="submit"
              disabled={isImportPending || !canImport}
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isImportPending ? "Importing..." : "Import users"}
            </button>
          </form>
        ) : null}

        <ActionStateMessage
          state={importState.message ? importState : undefined}
        />
      </div>
    </section>
  );
}

function ImportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

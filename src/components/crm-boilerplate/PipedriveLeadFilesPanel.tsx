"use client";

import { ExternalLink, FileText, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { syncPipedriveLeadFilesAction } from "@/lib/actions/sales";

export type PipedriveLeadFileReference = {
  id: string;
  name: string;
  sizeLabel: string | null;
  typeLabel: string | null;
  updatedAt: string | null;
  url: string | null;
};

export type PipedriveLeadFilesPanelProps = {
  canSync: boolean;
  files: PipedriveLeadFileReference[];
  saleId: string;
};

export default function PipedriveLeadFilesPanel({
  canSync,
  files,
  saleId,
}: PipedriveLeadFilesPanelProps) {
  const router = useRouter();
  const [state, action, isPending] = useActionState(
    syncPipedriveLeadFilesAction,
    { ok: false, message: "" },
  );

  useEffect(() => {
    if (!state.ok) return;

    router.refresh();
  }, [router, state.ok]);

  return (
    <section className="mb-5 border-b border-gray-200 pb-5 dark:border-gray-800">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Pipedrive files
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {files.length} linked
              </p>
            </div>
          </div>
        </div>

        {canSync ? (
          <form
            action={action}
            className="flex flex-col items-start gap-1 sm:items-end"
          >
            <input type="hidden" name="saleId" value={saleId} />
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/30"
            >
              <RefreshCw
                className={`size-4 ${isPending ? "animate-spin" : ""}`}
              />
              {isPending ? "Pulling files" : "Pull Pipedrive files"}
            </button>
            {state.message ? (
              <div className="max-w-72 text-left sm:text-right">
                <ActionStateMessage state={state} />
              </div>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {files.length ? (
          files.map((file) => {
            const details = [file.typeLabel, file.sizeLabel, file.updatedAt]
              .filter(Boolean)
              .join(" · ");

            return (
              <div
                key={file.id}
                className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:hover:border-brand-900/60 dark:hover:bg-brand-900/10"
              >
                <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {file.name}
                  </span>
                  {details ? (
                    <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                      {details}
                    </span>
                  ) : null}
                </span>
                {file.url ? (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                    aria-label={`Open ${file.name} in Pipedrive`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm leading-6 text-gray-500 dark:border-gray-800 dark:text-gray-400">
            No Pipedrive files found for this linked lead.
          </p>
        )}
      </div>
    </section>
  );
}

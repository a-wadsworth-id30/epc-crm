"use client";

import { AlertCircle, Database, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  readPipedriveSaleContextAction,
  type PipedriveSaleContextState,
} from "@/lib/actions/pipedrive-sale-context";

export type PipedriveLeadContextPanelProps = {
  saleId: string;
};

const loadErrorState: PipedriveSaleContextState = {
  customFields: [],
  fetchedAt: null,
  leadId: null,
  leadTitle: null,
  leadUrl: null,
  message: "Pipedrive context could not be loaded.",
  ok: false,
  status: "provider-error",
  summary: [],
};

export default function PipedriveLeadContextPanel({
  saleId,
}: PipedriveLeadContextPanelProps) {
  const [state, setState] = useState<PipedriveSaleContextState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadContext = useCallback(async () => {
    setIsLoading(true);

    try {
      setState(await readPipedriveSaleContextAction(saleId));
    } catch {
      setState(loadErrorState);
    } finally {
      setIsLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    readPipedriveSaleContextAction(saleId)
      .then((nextState) => {
        if (!cancelled) setState(nextState);
      })
      .catch(() => {
        if (!cancelled) setState(loadErrorState);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [saleId]);

  const isBusy = isLoading;
  const hasData = Boolean(
    state?.summary.length || state?.customFields.length,
  );

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
            <Database className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
              Pipedrive context
            </h2>
            <p className="mt-0.5 truncate text-xs font-medium text-gray-500 dark:text-gray-400">
              {state?.leadTitle || state?.leadId || "Linked lead"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state?.leadUrl ? (
            <a
              href={state.leadUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => void loadContext()}
            disabled={isBusy}
            title="Refresh Pipedrive context"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-theme-xs transition hover:border-brand-200 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-brand-900/60 dark:hover:text-brand-300"
          >
            <RefreshCw className={`h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isBusy && !state ? <PipedriveContextSkeleton /> : null}

      {!isBusy && state && !state.ok ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm font-medium text-warning-700 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
      ) : null}

      {state?.ok && hasData ? (
        <div className="mt-4 space-y-4">
          {state.summary.length ? (
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {state.summary.map((item) => (
                <div key={item.label} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    {item.label}
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {state.customFields.length ? (
            <div className="border-t border-gray-200 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">
                Custom fields
              </h3>
              <dl className="mt-3 grid gap-3 md:grid-cols-2">
                {state.customFields.map((field) => (
                  <div
                    key={field.key}
                    className="min-w-0 rounded-lg bg-gray-50 px-3 py-2 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:ring-gray-800"
                  >
                    <dt className="flex min-w-0 items-center justify-between gap-3">
                      <span className="truncate text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                        {field.label}
                      </span>
                      {field.type ? (
                        <span className="shrink-0 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                          {field.type}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">
                      {field.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </div>
      ) : null}

      {state?.ok && !hasData ? (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm font-medium text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.03] dark:text-gray-400 dark:ring-gray-800">
          No Pipedrive fields found.
        </p>
      ) : null}

      {state?.fetchedAt ? (
        <p className="mt-3 text-xs font-medium text-gray-400 dark:text-gray-500">
          Updated {new Date(state.fetchedAt).toLocaleTimeString("en-GB")}
        </p>
      ) : null}
    </section>
  );
}

function PipedriveContextSkeleton() {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="min-w-0">
          <div className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-2 h-4 w-32 rounded bg-gray-50 dark:bg-white/[0.05]" />
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminRouteError({
  description = "The page hit an unexpected error while loading. Retry the page first, then check system health if it keeps happening.",
  error,
  reset,
  title = "This page could not load",
}: {
  description?: string;
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  useEffect(() => {
    console.error("Admin route error", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="rounded-2xl border border-error-200 bg-white p-6 shadow-theme-xs dark:border-error-900/50 dark:bg-white/[0.03]"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-300">
            <AlertTriangle className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white/90">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              {description}
            </p>
            {error.digest ? (
              <p className="mt-3 text-xs font-medium text-gray-400 dark:text-gray-500">
                Error reference: {error.digest}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
          >
            <RefreshCw className="size-4" />
            Retry
          </button>
          <Link
            href="/settings/system"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]"
          >
            System health
          </Link>
        </div>
      </div>
    </div>
  );
}

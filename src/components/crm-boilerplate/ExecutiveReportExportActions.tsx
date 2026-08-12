"use client";

import Link from "next/link";

export default function ExecutiveReportExportActions({
  downloadHref,
  packHref,
  printMode = false,
}: {
  downloadHref: string;
  packHref: string;
  printMode?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3 print:hidden">
      {!printMode ? (
        <Link
          href={packHref}
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
        >
          Open client pack
        </Link>
      ) : null}
      <a
        href={downloadHref}
        className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
      >
        Download client pack
      </a>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600"
      >
        {printMode ? "Print / save PDF" : "Print report"}
      </button>
    </div>
  );
}

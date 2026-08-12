import Link from "next/link";

type PaginationParams = Record<string, number | string | null | undefined>;

const defaultPageSizeOptions = [10, 25, 50];

function cleanParams(params: URLSearchParams) {
  if (params.get("page") === "1") {
    params.delete("page");
  }
  if (!params.toString()) {
    return "";
  }

  return `?${params.toString()}`;
}

export default function ServerPagination({
  basePath,
  page,
  pageSize,
  pageSizeOptions = defaultPageSizeOptions,
  params = {},
  totalCount,
}: {
  basePath: string;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  params?: PaginationParams;
  totalCount: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const firstRow = totalCount ? (currentPage - 1) * pageSize + 1 : 0;
  const lastRow = Math.min(currentPage * pageSize, totalCount);

  function hrefFor(updates: PaginationParams) {
    const nextParams = new URLSearchParams();

    Object.entries({ ...params, ...updates }).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") return;
      nextParams.set(key, String(value));
    });

    return `${basePath}${cleanParams(nextParams)}`;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing {firstRow}-{lastRow} of {totalCount}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {pageSizeOptions.map((option) => (
            <Link
              key={option}
              href={hrefFor({ page: null, pageSize: option })}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition ${
                option === pageSize
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-500/70 dark:bg-brand-500/10 dark:text-brand-300"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05]"
              }`}
            >
              {option}
            </Link>
          ))}
        </div>
        <Link
          href={hrefFor({ page: currentPage > 2 ? currentPage - 1 : null })}
          aria-disabled={currentPage === 1}
          className={`inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-xs font-medium transition dark:border-gray-700 ${
            currentPage === 1
              ? "pointer-events-none text-gray-400 opacity-50 dark:text-gray-600"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          }`}
        >
          Previous
        </Link>
        <span className="min-w-14 text-center text-xs font-medium text-gray-600 dark:text-gray-300">
          {currentPage} / {totalPages}
        </span>
        <Link
          href={hrefFor({ page: currentPage + 1 })}
          aria-disabled={currentPage === totalPages}
          className={`inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-xs font-medium transition dark:border-gray-700 ${
            currentPage === totalPages
              ? "pointer-events-none text-gray-400 opacity-50 dark:text-gray-600"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          }`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}

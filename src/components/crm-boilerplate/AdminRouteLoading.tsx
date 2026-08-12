function LoadingBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-gray-200/80 dark:bg-gray-800/80 ${className}`}
    />
  );
}

function LoadingCard({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      {children ?? (
        <div className="space-y-3">
          <LoadingBlock className="h-4 w-2/3" />
          <LoadingBlock className="h-8 w-1/2" />
          <LoadingBlock className="h-3 w-full" />
        </div>
      )}
    </div>
  );
}

export default function AdminRouteLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading page"
      className="space-y-6"
    >
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <LoadingBlock className="h-4 w-32" />
          <LoadingBlock className="h-8 w-56 max-w-full" />
        </div>
        <LoadingBlock className="h-10 w-full sm:w-36" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
        <LoadingCard />
      </div>

      <LoadingCard>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <LoadingBlock className="h-5 w-40" />
            <LoadingBlock className="h-9 w-full sm:w-48" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-gray-100 p-3 dark:border-gray-800 sm:grid-cols-[1.5fr_1fr_1fr_96px]"
              >
                <LoadingBlock className="h-4 w-full" />
                <LoadingBlock className="h-4 w-3/4" />
                <LoadingBlock className="h-4 w-2/3" />
                <LoadingBlock className="h-6 w-20" />
              </div>
            ))}
          </div>
        </div>
      </LoadingCard>
    </div>
  );
}

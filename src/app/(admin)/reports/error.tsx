"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AdminRouteError
      error={error}
      reset={reset}
      title="Reports could not load"
      description="The reporting workspace could not finish loading. Retry the page, then check system health if report data remains unavailable."
    />
  );
}

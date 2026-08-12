"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function SalesError({
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
      title="Sales could not load"
      description="The sales workspace could not finish loading. Retry the page, then check system health if sales data is still unavailable."
    />
  );
}

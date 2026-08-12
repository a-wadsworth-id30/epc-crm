"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function MarketingError({
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
      title="Marketing could not load"
      description="The marketing workspace could not finish loading. Retry the page, then check integrations and system health if this continues."
    />
  );
}

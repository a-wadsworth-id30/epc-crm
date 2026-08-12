"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function TelephonyError({
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
      title="Telephony could not load"
      description="The telephony workspace could not finish loading. Retry the page, then check phone system readiness and system health if this continues."
    />
  );
}

"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function SettingsError({
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
      title="Settings could not load"
      description="The settings area could not finish loading. Retry the page, then check system health if configuration data is still unavailable."
    />
  );
}

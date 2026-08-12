"use client";

import AdminRouteError from "@/components/crm-boilerplate/AdminRouteError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminRouteError error={error} reset={reset} />;
}

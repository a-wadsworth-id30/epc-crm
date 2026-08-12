"use client";

import dynamic from "next/dynamic";

const LoadedVisitorLogLiveRefresh = dynamic(
  () => import("@/components/crm-boilerplate/VisitorLogLiveRefresh"),
  { ssr: false },
);

export default function LazyVisitorLogLiveRefresh() {
  return <LoadedVisitorLogLiveRefresh />;
}

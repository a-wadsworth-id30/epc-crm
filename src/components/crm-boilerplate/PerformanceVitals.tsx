"use client";

import { useReportWebVitals } from "next/web-vitals";

const enabled = process.env.NEXT_PUBLIC_PERFORMANCE_WEB_VITALS_ENABLED === "true";
const buildCommit = process.env.APP_BUILD_COMMIT ?? "unknown";

export default function PerformanceVitals() {
  useReportWebVitals((metric) => {
    if (!enabled || typeof window === "undefined") return;

    const payload = {
      buildCommit,
      delta: metric.delta,
      id: metric.id,
      label: metric.label,
      name: metric.name,
      navigationType: metric.navigationType,
      pathname: window.location.pathname,
      rating: metric.rating,
      value: metric.value,
    };
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/performance/web-vitals", blob);
      return;
    }

    void fetch("/api/performance/web-vitals", {
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      method: "POST",
    });
  });

  return null;
}

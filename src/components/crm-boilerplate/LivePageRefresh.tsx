"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

export default function LivePageRefresh({
  eventSourceUrl = "/api/telephony/live-events",
  intervalMs = 5000,
}: {
  eventSourceUrl?: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let interval: number | null = null;

    function isVisible() {
      return document.visibilityState === "visible";
    }

    function refresh() {
      if (!isVisible()) {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < intervalMs) {
        return;
      }

      lastRefreshAtRef.current = now;
      startTransition(() => router.refresh());
    }

    function forceRefresh() {
      if (!isVisible()) {
        return;
      }

      lastRefreshAtRef.current = Date.now();
      startTransition(() => router.refresh());
    }

    function stopEventSource() {
      eventSource?.removeEventListener("telephony", forceRefresh);
      eventSource?.close();
      eventSource = null;
    }

    function startEventSource() {
      if (eventSource || !isVisible() || !("EventSource" in window)) return;

      eventSource = new EventSource(eventSourceUrl);
      eventSource.addEventListener("telephony", forceRefresh);
    }

    function stopInterval() {
      if (interval === null) return;

      window.clearInterval(interval);
      interval = null;
    }

    function startInterval() {
      if (interval !== null || !isVisible()) return;

      interval = window.setInterval(refresh, intervalMs);
    }

    function syncVisibility({ refreshOnVisible = true } = {}) {
      if (isVisible()) {
        startEventSource();
        startInterval();
        if (refreshOnVisible) refresh();
        return;
      }

      stopEventSource();
      stopInterval();
    }

    const handleVisibilityChange = () => syncVisibility();

    syncVisibility({ refreshOnVisible: false });
    window.addEventListener("id30:softphone-availability-updated", forceRefresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopInterval();
      stopEventSource();
      window.removeEventListener("id30:softphone-availability-updated", forceRefresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [eventSourceUrl, intervalMs, router]);

  return null;
}

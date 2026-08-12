"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useTransition } from "react";

export type RealtimePageRefreshProps = {
  browserEvents?: string[];
  fallbackIntervalMs?: number;
  minRefreshIntervalMs?: number;
  topics: string[];
};

export default function RealtimePageRefresh({
  browserEvents = [],
  fallbackIntervalMs = 120000,
  minRefreshIntervalMs = 3000,
  topics,
}: RealtimePageRefreshProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const lastRefreshAtRef = useRef(0);
  const topicKey = useMemo(
    () =>
      Array.from(new Set(topics.map((topic) => topic.trim()).filter(Boolean)))
        .sort()
        .join(","),
    [topics],
  );
  const browserEventKey = useMemo(
    () => Array.from(new Set(browserEvents)).sort().join(","),
    [browserEvents],
  );

  useEffect(() => {
    if (!topicKey) return;

    const eventNames = browserEventKey.split(",").filter(Boolean);
    let eventSource: EventSource | null = null;
    let fallbackTimer: number | null = null;

    function isVisible() {
      return document.visibilityState === "visible";
    }

    function refresh({ force = false } = {}) {
      if (!isVisible()) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < minRefreshIntervalMs) {
        return;
      }

      lastRefreshAtRef.current = now;
      startTransition(() => router.refresh());
    }

    const params = new URLSearchParams();
    topicKey.split(",").forEach((topic) => params.append("topic", topic));
    const handlePassiveRefresh = () => refresh();
    const handleRealtimeUpdate = () => refresh({ force: true });

    function stopEventSource() {
      eventSource?.removeEventListener("update", handleRealtimeUpdate);
      eventSource?.removeEventListener("error", handlePassiveRefresh);
      eventSource?.close();
      eventSource = null;
    }

    function startEventSource() {
      if (eventSource || !isVisible() || !("EventSource" in window)) return;

      eventSource = new EventSource(`/api/realtime/events?${params.toString()}`);
      eventSource.addEventListener("update", handleRealtimeUpdate);
      eventSource.addEventListener("error", handlePassiveRefresh);
    }

    function stopFallbackTimer() {
      if (fallbackTimer === null) return;

      window.clearInterval(fallbackTimer);
      fallbackTimer = null;
    }

    function startFallbackTimer() {
      if (fallbackTimer !== null || !isVisible()) return;

      fallbackTimer = window.setInterval(
        handlePassiveRefresh,
        fallbackIntervalMs,
      );
    }

    function syncVisibility({ refreshOnVisible = true } = {}) {
      if (isVisible()) {
        startEventSource();
        startFallbackTimer();
        if (refreshOnVisible) handlePassiveRefresh();
        return;
      }

      stopEventSource();
      stopFallbackTimer();
    }

    const handleVisibilityChange = () => syncVisibility();

    syncVisibility({ refreshOnVisible: false });
    eventNames.forEach((eventName) =>
      window.addEventListener(eventName, handleRealtimeUpdate),
    );
    window.addEventListener("focus", handlePassiveRefresh);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopEventSource();
      stopFallbackTimer();
      eventNames.forEach((eventName) =>
        window.removeEventListener(eventName, handleRealtimeUpdate),
      );
      window.removeEventListener("focus", handlePassiveRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [browserEventKey, fallbackIntervalMs, minRefreshIntervalMs, router, topicKey]);

  return null;
}

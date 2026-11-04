"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import NotificationBellButton from "@/components/header/NotificationBellButton";
import type {
  NotificationDropdownProps,
} from "@/components/header/NotificationDropdown";
import type { HeaderNotification } from "@/lib/notifications";

const LoadedNotificationDropdown = dynamic<NotificationDropdownProps>(
  () =>
    import("@/components/header/NotificationDropdown").then(
      (module) => module.default,
    ),
  {
    ssr: false,
    loading: () => (
      <NotificationBellButton
        actionableCount={0}
        criticalCount={0}
        disabled
        onClick={() => undefined}
      />
    ),
  },
);

export default function LazyNotificationDropdown({
  notifications: initialNotifications = [],
}: {
  notifications?: HeaderNotification[];
}) {
  const [hasLoadedPanel, setHasLoadedPanel] = useState(false);
  const [notifications, setNotifications] =
    useState<HeaderNotification[]>(initialNotifications);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let fallbackTimer: number | null = null;

    async function loadNotificationCounts() {
      try {
        const response = await fetch("/api/notifications", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) return;

        const payload = (await response.json()) as {
          notifications?: HeaderNotification[];
        };

        if (!cancelled && Array.isArray(payload.notifications)) {
          setNotifications(payload.notifications);
        }
      } catch {
        // Notifications are not critical to page navigation.
      }
    }

    function startRealtimeUpdates() {
      if (eventSource || !("EventSource" in window)) return;

      eventSource = new EventSource(
        "/api/realtime/events?topic=notifications",
      );
      eventSource.addEventListener("update", loadNotificationCounts);
      eventSource.addEventListener("error", loadNotificationCounts);
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      void loadNotificationCounts();
      startRealtimeUpdates();
    }

    void loadNotificationCounts();
    startRealtimeUpdates();
    fallbackTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadNotificationCounts();
      }
    }, 60_000);
    window.addEventListener("focus", loadNotificationCounts);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      eventSource?.removeEventListener("update", loadNotificationCounts);
      eventSource?.removeEventListener("error", loadNotificationCounts);
      eventSource?.close();
      if (fallbackTimer !== null) window.clearInterval(fallbackTimer);
      window.removeEventListener("focus", loadNotificationCounts);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (hasLoadedPanel) {
    return (
      <LoadedNotificationDropdown
        autoOpen
        notifications={notifications}
      />
    );
  }

  const actionableCount = notifications.filter(
    (item) => item.severity !== "info" && !item.isRead,
  ).length;
  const criticalCount = notifications.filter(
    (item) => item.severity === "critical" && !item.isRead,
  ).length;

  return (
    <NotificationBellButton
      actionableCount={actionableCount}
      criticalCount={criticalCount}
      onClick={() => setHasLoadedPanel(true)}
    />
  );
}

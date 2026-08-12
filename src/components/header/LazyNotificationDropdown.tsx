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

    loadNotificationCounts();

    return () => {
      cancelled = true;
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

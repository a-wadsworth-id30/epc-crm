"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import NotificationBellButton from "@/components/header/NotificationBellButton";
import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import type { HeaderNotification } from "@/lib/notifications";
import { cn } from "@/utils";

type Filter = "All" | HeaderNotification["category"];

export type NotificationDropdownProps = {
  autoOpen?: boolean;
  notifications?: HeaderNotification[];
};

export default function NotificationDropdown({
  autoOpen = false,
  notifications: initialNotifications = [],
}: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("All");
  const [notifications, setNotifications] =
    useState<HeaderNotification[]>(initialNotifications);
  const [isLoading, setIsLoading] = useState(initialNotifications.length === 0);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const actionableCount = notifications.filter(
    (item) => item.severity !== "info" && !item.isRead,
  ).length;
  const criticalCount = notifications.filter(
    (item) => item.severity === "critical" && !item.isRead,
  ).length;
  const unreadCount = notifications.filter((item) => !item.isRead).length;
  const filters = useMemo<Filter[]>(() => {
    const categories = Array.from(
      new Set(notifications.map((item) => item.category)),
    );

    return ["All", ...categories];
  }, [notifications]);
  const filteredNotifications =
    filter === "All"
      ? notifications
      : notifications.filter((item) => item.category === filter);

  useEffect(() => {
    if (autoOpen) {
      setIsOpen(true);
    }
  }, [autoOpen]);

  function mergeReviewedNotifications(
    nextNotifications: HeaderNotification[],
    notificationId?: string,
  ) {
    const reviewedAt = new Date().toISOString();

    setNotifications((currentNotifications) => {
      const nextById = new Map(
        nextNotifications.map((notification) => [
          notification.id,
          notification,
        ]),
      );
      const currentIds = new Set(
        currentNotifications.map((notification) => notification.id),
      );
      const mergedCurrent = currentNotifications.map((notification) => {
        const nextNotification = nextById.get(notification.id);
        const mergedNotification = nextNotification ?? notification;
        const shouldMarkReviewed =
          !notificationId || notification.id === notificationId;

        if (!shouldMarkReviewed) {
          return mergedNotification;
        }

        return {
          ...mergedNotification,
          isRead: true,
          reviewedAt:
            mergedNotification.reviewedAt ??
            notification.reviewedAt ??
            reviewedAt,
        };
      });
      const newNotifications = nextNotifications.filter(
        (notification) => !currentIds.has(notification.id),
      );

      return [...mergedCurrent, ...newNotifications];
    });
  }

  useEffect(() => {
    let cancelled = false;

    async function loadNotifications() {
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
        // Notifications are non-critical; the menu can remain empty if this fails.
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleDropdown() {
    setIsOpen((open) => !open);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  async function updateNotifications({
    action,
    notificationId,
  }: {
    action: "dismiss" | "mark-all-reviewed" | "mark-reviewed";
    notificationId?: string;
  }) {
    if (action === "mark-reviewed" && !notificationId) return;

    const actionKey = notificationId ? `${action}:${notificationId}` : action;

    setPendingAction(actionKey);

    try {
      const isReviewAction =
        action === "mark-all-reviewed" || action === "mark-reviewed";

      const response = await fetch("/api/notifications", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, notificationId }),
      });

      if (!response.ok) return;

      const payload = (await response.json()) as {
        notifications?: HeaderNotification[];
      };

      if (Array.isArray(payload.notifications)) {
        if (isReviewAction) {
          mergeReviewedNotifications(
            payload.notifications,
            action === "mark-reviewed" ? notificationId : undefined,
          );
        } else {
          setNotifications(payload.notifications);
        }
      }
    } finally {
      setPendingAction((current) => (current === actionKey ? null : current));
    }
  }

  function handleNotificationOpen(notification: HeaderNotification) {
    if (!notification.isRead) {
      void updateNotifications({
        action: "mark-reviewed",
        notificationId: notification.id,
      });
    }

    closeDropdown();
  }

  return (
    <div className="relative">
      <NotificationBellButton
        actionableCount={actionableCount}
        criticalCount={criticalCount}
        onClick={toggleDropdown}
      />

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute -left-52 mt-[17px] flex h-[520px] w-[360px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg sm:w-[420px] xl:right-0 xl:left-auto dark:border-gray-800 dark:bg-gray-dark"
      >
        <div className="border-b border-gray-100 pb-3 dark:border-gray-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Notifications
              </h5>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {unreadCount > 0
                  ? `${unreadCount} item${unreadCount === 1 ? "" : "s"} not reviewed.`
                  : "Site-wide activity and items that need review."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  disabled={pendingAction === "mark-all-reviewed"}
                  onClick={() =>
                    void updateNotifications({ action: "mark-all-reviewed" })
                  }
                  className="h-8 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                >
                  Mark all reviewed
                </button>
              )}
              <button
                type="button"
                onClick={toggleDropdown}
                className="dropdown-toggle text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close notifications"
              >
                <svg
                  className="fill-current"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={cn(
                  "h-8 shrink-0 rounded-lg border px-3 text-xs font-medium",
                  filter === item
                    ? "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex custom-scrollbar h-auto flex-col overflow-y-auto py-2">
          {isLoading && (
            <li className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading notifications...
            </li>
          )}

          {!isLoading && filteredNotifications.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No notifications found.
            </li>
          )}

          {!isLoading &&
            filteredNotifications.map((notification) => (
              <li key={notification.id}>
                <div
                  className={cn(
                    "rounded-lg border-b border-gray-100 p-3 transition hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5",
                    !notification.isRead &&
                      "bg-brand-50/40 dark:bg-brand-900/10",
                  )}
                >
                  <Link
                    href={notification.href}
                    onClick={() => handleNotificationOpen(notification)}
                    className="flex gap-3"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        severityClass(notification.severity),
                      )}
                    >
                      {categoryInitial(notification.category)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {!notification.isRead && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                          )}
                          <span className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                            {notification.title}
                          </span>
                        </span>
                        <span
                          className={severityPillClass(notification.severity)}
                        >
                          {severityLabel(notification.severity)}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                        {notification.detail}
                      </span>
                      <span className="mt-2 flex items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
                        <span>{notification.category}</span>
                        <span className="h-1 w-1 rounded-full bg-gray-400" />
                        <span>
                          {notification.isRead ? "Reviewed" : "Open"}
                        </span>
                      </span>
                    </span>
                  </Link>

                  <div className="mt-3 ml-12 flex flex-wrap items-center gap-2">
                    {!notification.isRead && (
                      <button
                        type="button"
                        disabled={
                          pendingAction ===
                          `mark-reviewed:${notification.id}`
                        }
                        onClick={() =>
                          void updateNotifications({
                            action: "mark-reviewed",
                            notificationId: notification.id,
                          })
                        }
                        className="h-7 rounded-md border border-gray-200 px-2.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                      >
                        Mark reviewed
                      </button>
                    )}
                    {notification.canDismiss && (
                      <button
                        type="button"
                        disabled={
                          pendingAction === `dismiss:${notification.id}`
                        }
                        onClick={() =>
                          void updateNotifications({
                            action: "dismiss",
                            notificationId: notification.id,
                          })
                        }
                        className="h-7 rounded-md px-2.5 text-xs font-medium text-gray-500 transition hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
        </ul>

        <Link
          href="/"
          onClick={closeDropdown}
          className="mt-3 block rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Open dashboard
        </Link>
      </Dropdown>
    </div>
  );
}

function categoryInitial(category: HeaderNotification["category"]) {
  if (category === "Contacts") return "C";
  if (category === "Marketing") return "M";
  if (category === "Storage") return "F";
  if (category === "Telephony") return "T";
  if (category === "Sales") return "S";
  if (category === "System") return "!";
  return "A";
}

function severityLabel(severity: HeaderNotification["severity"]) {
  if (severity === "critical") return "Action";
  if (severity === "warning") return "Review";
  return "Info";
}

function severityClass(severity: HeaderNotification["severity"]) {
  if (severity === "critical") {
    return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }

  if (severity === "warning") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }

  return "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300";
}

function severityPillClass(severity: HeaderNotification["severity"]) {
  return cn(
    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
    severityClass(severity),
  );
}

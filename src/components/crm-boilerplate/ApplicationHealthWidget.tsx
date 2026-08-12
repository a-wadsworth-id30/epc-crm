"use client";

import { useEffect, useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";

type HealthStatus = {
  ok: boolean;
  database: string;
  build?: {
    shortCommit?: string;
    branch?: string;
    builtAt?: string;
    runtimeStartedAt?: string;
  };
};

export default function ApplicationHealthWidget({
  showLabels,
}: {
  showLabels: boolean;
}) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  useClickOutside(popoverRef, () => setIsOpen(false));

  useEffect(() => {
    let active = true;

    async function loadHealth() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        const data = (await response.json()) as HealthStatus;

        if (!active) return;

        setHealth(data);
        setError(!response.ok || !data.ok);
        setCheckedAt(new Date());
      } catch {
        if (!active) return;

        setHealth(null);
        setError(true);
        setCheckedAt(new Date());
      }
    }

    loadHealth();
    const interval = window.setInterval(loadHealth, 300_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const formatTime = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  const formatDateTime = (value: string | undefined) =>
    value && value !== "unknown"
      ? new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(value))
      : "Unknown";
  const healthy = Boolean(health?.ok && health.database === "ok" && !error);
  const statusLabel = healthy ? "Healthy" : error ? "Check failed" : "Checking";
  const statusClasses = healthy
    ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
    : error
      ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
      : "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300";
  const dotClasses = healthy
    ? "bg-success-500"
    : error
      ? "bg-error-500"
      : "bg-gray-400";
  const lastChecked = checkedAt ? formatTime(checkedAt) : "Pending";
  const builtAt = formatDateTime(health?.build?.builtAt);
  const runtimeStartedAt = formatDateTime(health?.build?.runtimeStartedAt);
  const hasDetailedBuild =
    builtAt !== "Unknown" || runtimeStartedAt !== "Unknown" || health?.build?.branch;
  const buildLabel =
    [health?.build?.branch, health?.build?.shortCommit].filter(Boolean).join(" @ ") ||
    health?.build?.shortCommit ||
    "Unknown";
  const popoverId = "application-health-popover";

  return (
    <div
      ref={popoverRef}
      className="relative mb-2 border-t border-gray-200 pt-3 dark:border-gray-800"
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        className={`group flex items-center border border-gray-200 bg-white text-[12px] font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-100 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-300 dark:hover:bg-white/[0.07] ${
          showLabels
            ? "h-8 w-full justify-between gap-2 rounded-lg px-2"
            : "mx-auto h-8 w-8 justify-center rounded-lg"
        }`}
        title={`Application Health: ${statusLabel}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClasses}`} />
          {showLabels && (
            <span className="sidebar-label-enter truncate">App health</span>
          )}
        </span>
        {showLabels && (
          <span
            className={`sidebar-label-enter inline-flex shrink-0 items-center rounded-full px-2 py-0.5 ${statusClasses}`}
          >
            {statusLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id={popoverId}
          className={`absolute bottom-full z-40 mb-2 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-theme-lg dark:border-gray-800 dark:bg-gray-900 ${
            showLabels ? "right-0 left-0" : "left-full ml-3 w-72"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                Application health
              </p>
              <p className="mt-0.5 text-gray-500 dark:text-gray-400">
                Checked {lastChecked}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold ${statusClasses}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
              {statusLabel}
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <HealthPopoverRow
              label="Database"
              value={health?.database ?? "Unknown"}
            />
            {hasDetailedBuild && <HealthPopoverRow label="Built" value={builtAt} />}
            {hasDetailedBuild && (
              <HealthPopoverRow label="Runtime" value={runtimeStartedAt} />
            )}
            <HealthPopoverRow label="Build" value={buildLabel} />
          </div>
        </div>
      )}
    </div>
  );
}

function HealthPopoverRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="min-w-0 truncate font-semibold text-gray-800 dark:text-white/90">
        {value}
      </span>
    </div>
  );
}

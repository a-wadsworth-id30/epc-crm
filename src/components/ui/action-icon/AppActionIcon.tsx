"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Tooltip from "@/components/ui/tooltip/Tooltip";

export type AppActionIconName =
  | "add"
  | "ai"
  | "close"
  | "confirm"
  | "copy"
  | "delete"
  | "download"
  | "edit"
  | "open"
  | "play"
  | "search"
  | "transcript"
  | "upload"
  | "view"
  | "warning";

type IconVariant = "neutral" | "primary" | "danger" | "success" | "muted";
type IconSize = "xs" | "sm" | "md";

const variantClasses: Record<IconVariant, string> = {
  danger:
    "border-error-200 text-error-600 hover:bg-error-50 disabled:hover:bg-white dark:border-error-900/50 dark:text-error-300 dark:hover:bg-error-900/20",
  muted:
    "border-transparent text-gray-400 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-500 dark:hover:border-gray-800 dark:hover:bg-white/[0.05] dark:hover:text-gray-200",
  neutral:
    "border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05] dark:hover:text-white",
  primary:
    "border-brand-100 bg-brand-50 text-brand-600 hover:bg-brand-100 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300 dark:hover:bg-brand-900/30",
  success:
    "border-success-100 bg-success-50 text-success-700 hover:bg-success-100 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300 dark:hover:bg-success-900/30",
};

const sizeClasses: Record<IconSize, string> = {
  md: "h-9 w-9 rounded-lg",
  sm: "h-8 w-8 rounded-lg",
  xs: "h-7 w-7 rounded-md",
};

const iconSizeClasses: Record<IconSize, string> = {
  md: "h-5 w-5",
  sm: "h-4 w-4",
  xs: "h-3.5 w-3.5",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function AppActionIcon({
  className,
  name,
}: {
  className?: string;
  name: AppActionIconName;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      {actionIconPath(name)}
    </svg>
  );
}

function actionIconPath(name: AppActionIconName) {
  switch (name) {
    case "add":
      return <path d="M12 5v14M5 12h14" />;
    case "ai":
      return (
        <>
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
          <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" />
        </>
      );
    case "close":
      return <path d="M6 6l12 12M18 6L6 18" />;
    case "confirm":
      return <path d="M5 12.5l4.2 4.2L19 7" />;
    case "copy":
      return (
        <>
          <rect height="11" rx="2" width="11" x="8" y="8" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </>
      );
    case "delete":
      return (
        <>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M9 7V4h6v3" />
        </>
      );
    case "download":
      return (
        <>
          <path d="M12 4v10" />
          <path d="M8 10l4 4 4-4" />
          <path d="M5 20h14" />
        </>
      );
    case "edit":
      return (
        <>
          <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
          <path d="M13.5 6.5l4 4" />
        </>
      );
    case "open":
      return (
        <>
          <path d="M14 4h6v6" />
          <path d="M10 14L20 4" />
          <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
        </>
      );
    case "play":
      return <path d="M8 5v14l11-7-11-7Z" />;
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </>
      );
    case "transcript":
      return (
        <>
          <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M14 3v5h5" />
          <path d="M8 12h8M8 16h6" />
        </>
      );
    case "upload":
      return (
        <>
          <path d="M12 20V10" />
          <path d="M8 14l4-4 4 4" />
          <path d="M5 4h14" />
        </>
      );
    case "view":
      return (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      );
    case "warning":
      return (
        <>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.5 2.8 17.5A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.5L13.7 4.5a2 2 0 0 0-3.4 0Z" />
        </>
      );
  }
}

export function AppIconButton({
  className,
  icon,
  label,
  size = "sm",
  variant = "neutral",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: AppActionIconName;
  label: string;
  size?: IconSize;
  variant?: IconVariant;
}) {
  return (
    <Tooltip content={label} placement="top" variant="dark-plain">
      <button
        {...buttonProps}
        aria-label={label}
        title={undefined}
        className={cx(
          "inline-flex shrink-0 items-center justify-center border transition disabled:cursor-not-allowed disabled:opacity-45",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
      >
        <AppActionIcon className={iconSizeClasses[size]} name={icon} />
      </button>
    </Tooltip>
  );
}

export function AppIconLink({
  className,
  icon,
  label,
  size = "sm",
  variant = "neutral",
  ...anchorProps
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  icon: AppActionIconName;
  label: string;
  size?: IconSize;
  variant?: IconVariant;
}) {
  return (
    <Tooltip content={label} placement="top" variant="dark-plain">
      <a
        {...anchorProps}
        aria-label={label}
        title={undefined}
        className={cx(
          "inline-flex shrink-0 items-center justify-center border transition",
          sizeClasses[size],
          variantClasses[variant],
          className,
        )}
      >
        <AppActionIcon className={iconSizeClasses[size]} name={icon} />
      </a>
    </Tooltip>
  );
}

"use client";

import type { ReactNode } from "react";
import Button from "@/components/ui/button/Button";

export function DeferredPrimaryTrigger({
  disabled = false,
  icon,
  label,
  onOpen,
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onOpen: () => void;
}) {
  return (
    <Button disabled={disabled} size="sm" onClick={onOpen} startIcon={icon}>
      {label}
    </Button>
  );
}

export function DeferredSolidTrigger({
  disabled = false,
  label,
  onOpen,
}: {
  disabled?: boolean;
  label: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function DeferredIconTrigger({
  ariaLabel,
  disabled = false,
  icon,
  onOpen,
  tone = "neutral",
}: {
  ariaLabel: string;
  disabled?: boolean;
  icon: ReactNode;
  onOpen: () => void;
  tone?: "danger" | "neutral";
}) {
  const className =
    tone === "danger"
      ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-error-300 text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-error-800 dark:hover:bg-error-900/20"
      : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5";

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      {icon}
    </button>
  );
}

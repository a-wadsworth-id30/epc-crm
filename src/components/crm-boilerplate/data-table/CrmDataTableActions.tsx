"use client";

import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  PencilIcon,
  TrashBinIcon,
} from "@/icons";
import { cn } from "@/utils";
import type { CrmDataTableAction } from "./CrmDataTable";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const actionIcons = {
  view: EyeIcon,
  edit: PencilIcon,
  delete: TrashBinIcon,
  duplicate: CopyIcon,
  download: DownloadIcon,
} satisfies Record<string, IconComponent>;

export default function CrmDataTableActions<TData>({
  actions,
  row,
}: {
  actions: CrmDataTableAction<TData>[];
  row: TData;
}) {
  const visibleActions = actions.filter((action) => !action.hidden?.(row));

  if (!visibleActions.length) return null;

  return (
    <>
      {visibleActions.map((action) => {
        const disabled = action.disabled?.(row) ?? false;
        const Icon =
          typeof action.icon === "function"
            ? action.icon
            : action.icon
              ? actionIcons[action.icon]
              : null;
        const className = cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg border text-gray-600 shadow-theme-xs transition hover:bg-gray-50 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/5",
          action.variant === "danger"
            ? "border-error-200 text-error-600 hover:border-error-300 hover:text-error-700 dark:border-error-900/60 dark:text-error-400"
            : "border-gray-200 dark:border-gray-800 dark:text-gray-300",
        );

        if (action.href && !disabled) {
          return (
            <Link
              key={action.id}
              href={action.href(row)}
              className={className}
              title={action.label}
              aria-label={action.label}
            >
              {Icon ? <Icon className="h-4 w-4" /> : action.label}
            </Link>
          );
        }

        return (
          <button
            key={action.id}
            type="button"
            disabled={disabled}
            onClick={() => action.onSelect?.(row)}
            className={className}
            title={action.label}
            aria-label={action.label}
          >
            {Icon ? <Icon className="h-4 w-4" /> : action.label}
          </button>
        );
      })}
    </>
  );
}

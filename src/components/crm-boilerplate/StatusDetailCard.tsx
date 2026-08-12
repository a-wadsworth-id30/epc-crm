import type { ReactNode } from "react";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";

export default function StatusDetailCard({
  className = "",
  detail,
  label,
  status,
  value,
}: {
  className?: string;
  detail: ReactNode;
  label: ReactNode;
  status: string;
  value?: ReactNode;
}) {
  const hasValue = value !== undefined && value !== null;

  return (
    <div className={`rounded-lg border border-gray-100 p-4 dark:border-gray-800 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-gray-800 dark:text-white/90">{label}</h4>
          {hasValue ? (
            <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white/90">
              {value}
            </p>
          ) : null}
        </div>
        <StatusBadge>{status}</StatusBadge>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

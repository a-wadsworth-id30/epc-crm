import type { ComponentType, ReactNode } from "react";

export default function MetricCard({
  className = "",
  label,
  value,
  detail,
  icon: Icon,
  iconClassName = "size-5",
  iconContainerClassName = "inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-300",
  labelVariant = "default",
  muted = false,
  valueClassName,
}: {
  className?: string;
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  iconClassName?: string;
  iconContainerClassName?: string;
  labelVariant?: "default" | "uppercase";
  muted?: boolean;
  valueClassName?: string;
}) {
  const labelClassName =
    labelVariant === "uppercase"
      ? "text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
      : "text-sm text-gray-500 dark:text-gray-400";
  const resolvedValueClassName =
    valueClassName ??
    `mt-3 text-title-sm font-semibold ${
      muted ? "text-gray-500 dark:text-gray-400" : "text-gray-800 dark:text-white/90"
    }`;
  const content = (
    <>
      <span className={labelClassName}>{label}</span>
      <div className={resolvedValueClassName}>{value}</div>
    </>
  );

  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03] ${className}`}
    >
      {Icon ? (
        <div className="flex items-start justify-between gap-3">
          <div>{content}</div>
          <span className={iconContainerClassName}>
            <Icon className={iconClassName} />
          </span>
        </div>
      ) : (
        content
      )}
      {detail && <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
    </div>
  );
}

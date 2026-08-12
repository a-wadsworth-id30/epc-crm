import type { Key, ReactNode } from "react";

type ResponsiveBreakpoint = "md" | "lg" | "xl";

const tableVisibility: Record<ResponsiveBreakpoint, string> = {
  md: "hidden md:block",
  lg: "hidden lg:block",
  xl: "hidden xl:block",
};

const cardVisibility: Record<ResponsiveBreakpoint, string> = {
  md: "md:hidden",
  lg: "lg:hidden",
  xl: "xl:hidden",
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export default function ResponsiveDataList<T>({
  breakpoint = "lg",
  cardListClassName,
  className,
  empty,
  getKey,
  items,
  renderCard,
  table,
  tableClassName,
}: {
  breakpoint?: ResponsiveBreakpoint;
  cardListClassName?: string;
  className?: string;
  empty?: ReactNode;
  getKey: (item: T, index: number) => Key;
  items: readonly T[];
  renderCard: (item: T, index: number) => ReactNode;
  table: ReactNode;
  tableClassName?: string;
}) {
  return (
    <div className={className}>
      <div className={classes(tableVisibility[breakpoint], tableClassName)}>
        {table}
      </div>
      <div className={classes(cardVisibility[breakpoint], cardListClassName)}>
        {items.length
          ? items.map((item, index) => (
              <div key={getKey(item, index)}>{renderCard(item, index)}</div>
            ))
          : empty}
      </div>
    </div>
  );
}

export function ResponsiveDataField({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 min-w-0 text-sm font-medium text-gray-800 dark:text-white/90">
        {children}
      </dd>
    </div>
  );
}

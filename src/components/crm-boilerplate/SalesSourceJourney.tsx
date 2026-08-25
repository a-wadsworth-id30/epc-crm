import {
  AttributionSourceIconSlot,
  attributionFallbackKindFromText,
  type AttributionFallbackKind,
} from "@/components/crm-boilerplate/AttributionSourceIcon";
import Tooltip from "@/components/ui/tooltip/Tooltip";

export type SourceJourneyKind =
  | AttributionFallbackKind;

export type SourceJourneyItem = {
  id: string;
  label: string;
  detail?: string;
  kind: SourceJourneyKind;
};

const toneByKind: Record<SourceJourneyKind, string> = {
  search: "bg-blue-50 text-blue-700 ring-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:ring-blue-900/50",
  website: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-900/50",
  landing: "bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-500/10 dark:text-cyan-300 dark:ring-cyan-900/50",
  form: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-900/50",
  phone: "bg-green-50 text-green-700 ring-green-100 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-900/50",
  email: "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-900/50",
  sms: "bg-pink-50 text-pink-700 ring-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-900/50",
  crm: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800",
  source: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800",
};

function SourceIconSlot({
  item,
  size = "default",
}: {
  item: SourceJourneyItem;
  size?: "small" | "default";
}) {
  const iconClassName = size === "small" ? "block h-3.5 w-3.5" : "block h-4 w-4";

  return (
    <AttributionSourceIconSlot
      className="size-4"
      fallbackKind={item.kind}
      iconClassName={iconClassName}
      label={item.label}
    />
  );
}

function sourceTooltipText(item: SourceJourneyItem) {
  return item.detail ? `${item.label} · ${item.detail}` : item.label;
}

export function sourceJourneyKindFromText(value: string | null | undefined) {
  return attributionFallbackKindFromText(value);
}

export function SalesSourceJourney({
  items,
  compact = false,
  variant = "inline",
}: {
  items: SourceJourneyItem[];
  compact?: boolean;
  variant?: "inline" | "detail" | "table";
}) {
  const maxVisibleItems = variant === "table" ? (compact ? 4 : 5) : compact ? 5 : 7;
  const visibleItems = items.length
    ? items.slice(0, maxVisibleItems)
    : [{ id: "not-captured", label: "Not captured", kind: "crm" as const }];
  const extraCount = Math.max(0, items.length - visibleItems.length);

  if (variant === "detail" && !compact) {
    return (
      <div className="grid min-w-0 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
        {visibleItems.map((item, index) => (
          <div key={item.id} className="relative min-w-0">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -left-3 top-1/2 hidden h-px w-4 bg-gray-200 dark:bg-gray-800 sm:block"
              />
            ) : null}
            <div
              title={item.detail || item.label}
              className={`flex min-h-[58px] min-w-0 items-center gap-2 rounded-xl px-3 py-2.5 ring-1 ring-inset ${toneByKind[item.kind]}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/70 ring-1 ring-inset ring-current/10 dark:bg-gray-950/60">
                <SourceIconSlot item={item} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {item.label}
                </span>
                {item.detail ? (
                  <span className="mt-0.5 block truncate text-xs font-medium opacity-75">
                    {item.detail}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        ))}
        {extraCount ? (
          <span className="inline-flex min-h-[58px] items-center justify-center rounded-xl bg-gray-100 px-3 text-sm font-semibold text-gray-600 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800">
            +{extraCount} more
          </span>
        ) : null}
      </div>
    );
  }

  if (variant === "table") {
    const iconSizeClassName = compact ? "h-7 w-7" : "h-8 w-8";
    const extraSizeClassName = compact ? "h-7 min-w-7" : "h-8 min-w-8";

    return (
      <div className="flex min-w-0 items-center gap-1">
        {visibleItems.map((item, index) => (
          <div key={item.id} className="flex items-center">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="mr-1 h-px w-2 bg-gray-200 dark:bg-gray-800"
              />
            ) : null}
            <Tooltip
              content={
                <span className="block max-w-72 whitespace-normal text-center leading-5">
                  {sourceTooltipText(item)}
                </span>
              }
              placement="top"
              variant="dark"
            >
              <span
                className={`grid shrink-0 place-items-center rounded-full bg-white text-gray-600 ring-1 ring-inset ring-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:ring-gray-800 ${iconSizeClassName}`}
              >
                <SourceIconSlot item={item} />
                <span className="sr-only">{sourceTooltipText(item)}</span>
              </span>
            </Tooltip>
          </div>
        ))}
        {extraCount ? (
          <span className={`ml-2 inline-flex items-center justify-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800 ${extraSizeClassName}`}>
            +{extraCount}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {visibleItems.map((item, index) => (
        <div key={item.id} className="flex min-w-0 items-center gap-1.5">
          {index > 0 ? (
            <span className="text-xs text-gray-300 dark:text-gray-700">→</span>
          ) : null}
          <span
            title={item.detail || item.label}
            className={`inline-flex h-7 min-w-7 max-w-full items-center justify-center gap-1.5 rounded-full px-2 text-xs font-semibold ring-1 ring-inset ${toneByKind[item.kind]}`}
          >
            <SourceIconSlot item={item} size="small" />
            {!compact ? <span className="truncate">{item.label}</span> : null}
          </span>
        </div>
      ))}
      {extraCount ? (
        <span className="inline-flex h-7 items-center rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          +{extraCount}
        </span>
      ) : null}
    </div>
  );
}

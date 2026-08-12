import { z } from "zod";
import type { WorkspaceDefaults } from "@/lib/workspace-defaults";

const displayDateFormats = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
const displayTimeFormats = ["24-hour", "12-hour"] as const;
const displayWeekStartDays = ["monday", "sunday"] as const;
const displayNumberLocales = [
  "workspace",
  "en-GB",
  "en-US",
  "en-IE",
  "en-AU",
  "en-CA",
] as const;
const displayCurrencyStyles = ["symbol", "code"] as const;

export const displayDateFormatOptions = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const;

export const displayTimeFormatOptions = [
  { value: "24-hour", label: "24-hour" },
  { value: "12-hour", label: "12-hour" },
] as const;

export const displayWeekStartDayOptions = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
] as const;

export const displayNumberLocaleOptions = [
  { value: "workspace", label: "Use workspace locale" },
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-CA", label: "English (Canada)" },
] as const;

export const displayCurrencyStyleOptions = [
  { value: "symbol", label: "Currency symbol" },
  { value: "code", label: "Currency code" },
] as const;

export const defaultDisplayDefaults = {
  currencyDisplay: "symbol",
  dateFormat: "DD/MM/YYYY",
  numberLocale: "workspace",
  timeFormat: "24-hour",
  weekStartDay: "monday",
} as const;

export const displayDefaultsSchema = z.object({
  currencyDisplay: z.enum(displayCurrencyStyles),
  dateFormat: z.enum(displayDateFormats),
  numberLocale: z.enum(displayNumberLocales),
  timeFormat: z.enum(displayTimeFormats),
  weekStartDay: z.enum(displayWeekStartDays),
});

const partialDisplayDefaultsSchema = displayDefaultsSchema.partial();

export type DisplayDefaults = z.infer<typeof displayDefaultsSchema>;

export type DisplayFormattingContext = {
  displayDefaults: DisplayDefaults;
  workspaceDefaults: WorkspaceDefaults;
};

export function parseDisplayDefaults(value: unknown): DisplayDefaults {
  const parsed = partialDisplayDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultDisplayDefaults;
  }

  return displayDefaultsSchema.parse({
    ...defaultDisplayDefaults,
    ...parsed.data,
  });
}

export function resolveDisplayLocale({
  displayDefaults,
  workspaceDefaults,
}: DisplayFormattingContext) {
  return displayDefaults.numberLocale === "workspace"
    ? workspaceDefaults.locale
    : displayDefaults.numberLocale;
}

export function formatDisplayDate(
  value: Date | string | number | null | undefined,
  context: DisplayFormattingContext,
  fallback = "No date",
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  const parts = new Intl.DateTimeFormat(resolveDisplayLocale(context), {
    day: "2-digit",
    month: "2-digit",
    timeZone: context.workspaceDefaults.timezone,
    year: "numeric",
  }).formatToParts(date);
  const day = partValue(parts, "day");
  const month = partValue(parts, "month");
  const year = partValue(parts, "year");

  switch (context.displayDefaults.dateFormat) {
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${month}-${day}`;
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
  }
}

export function formatDisplayLongDate(
  value: Date | string | number,
  context: DisplayFormattingContext,
) {
  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat(resolveDisplayLocale(context), {
    dateStyle: "full",
    timeZone: context.workspaceDefaults.timezone,
  }).format(date);
}

export function formatDisplayTime(
  value: Date | string | number | null | undefined,
  context: DisplayFormattingContext,
  fallback = "No time",
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat(resolveDisplayLocale(context), {
    hour: "2-digit",
    hour12: context.displayDefaults.timeFormat === "12-hour",
    minute: "2-digit",
    timeZone: context.workspaceDefaults.timezone,
  }).format(date);
}

export function formatDisplayDateTime(
  value: Date | string | number | null | undefined,
  context: DisplayFormattingContext,
  fallback = "No date",
) {
  const date = toDate(value);

  if (!date) {
    return fallback;
  }

  return `${formatDisplayDate(date, context, fallback)} ${formatDisplayTime(
    date,
    context,
    "",
  )}`.trim();
}

export function formatDisplayMoney(
  valueCents: number,
  currency: string,
  context: DisplayFormattingContext,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(resolveDisplayLocale(context), {
    currency,
    currencyDisplay: context.displayDefaults.currencyDisplay,
    maximumFractionDigits: 0,
    style: "currency",
    ...options,
  }).format(valueCents / 100);
}

export function formatDisplayNumber(
  value: number,
  context: DisplayFormattingContext,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(resolveDisplayLocale(context), options).format(
    value,
  );
}

function partValue(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function toDate(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

import { z } from "zod";

export const workspaceDefaultCurrencyOptions = [
  { value: "GBP", label: "GBP - British pound" },
  { value: "USD", label: "USD - US dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "AUD", label: "AUD - Australian dollar" },
  { value: "CAD", label: "CAD - Canadian dollar" },
  { value: "NZD", label: "NZD - New Zealand dollar" },
  { value: "ZAR", label: "ZAR - South African rand" },
] as const;

export const workspaceDefaultTimezoneOptions = [
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Dublin", label: "Europe/Dublin" },
  { value: "Europe/Paris", label: "Europe/Paris" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Australia/Sydney", label: "Australia/Sydney" },
  { value: "UTC", label: "UTC" },
] as const;

export const workspaceDefaultLocaleOptions = [
  { value: "en-GB", label: "English (United Kingdom)" },
  { value: "en-US", label: "English (United States)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-CA", label: "English (Canada)" },
] as const;

export const workspaceDefaultCountryOptions = [
  { value: "GB", label: "United Kingdom" },
  { value: "IE", label: "Ireland" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "AU", label: "Australia" },
  { value: "NZ", label: "New Zealand" },
  { value: "ZA", label: "South Africa" },
] as const;

export const defaultWorkspaceDefaults = {
  country: "GB",
  currency: "GBP",
  locale: "en-GB",
  timezone: "Europe/London",
} as const;

function isSupportedTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isSupportedLocale(value: string) {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([value]).length === 1;
  } catch {
    return false;
  }
}

export const workspaceDefaultsSchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a 2-letter ISO country code."),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code."),
  locale: z
    .string()
    .trim()
    .min(2, "Choose a locale.")
    .refine(isSupportedLocale, "Choose a supported locale."),
  timezone: z
    .string()
    .trim()
    .min(1, "Choose a timezone.")
    .refine(isSupportedTimezone, "Choose a supported IANA timezone."),
});

const partialWorkspaceDefaultsSchema = workspaceDefaultsSchema.partial();

export type WorkspaceDefaults = z.infer<typeof workspaceDefaultsSchema>;

export function parseWorkspaceDefaults(value: unknown): WorkspaceDefaults {
  const parsed = partialWorkspaceDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultWorkspaceDefaults;
  }

  return workspaceDefaultsSchema.parse({
    ...defaultWorkspaceDefaults,
    ...parsed.data,
  });
}

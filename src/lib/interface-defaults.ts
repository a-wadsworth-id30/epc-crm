import { z } from "zod";

const defaultLandingPages = [
  "/",
  "/sales",
  "/contacts",
  "/tasks",
  "/marketing",
  "/telephony",
  "/reports",
] as const;

const tablePageSizes = [10, 20, 25, 50, 100] as const;

export const defaultLandingPageOptions = [
  { value: "/", label: "Dashboard" },
  { value: "/sales", label: "Sales pipeline" },
  { value: "/contacts", label: "Contacts" },
  { value: "/tasks", label: "Tasks" },
  { value: "/marketing", label: "Marketing" },
  { value: "/telephony", label: "Telephony" },
  { value: "/reports", label: "Reports" },
] as const;

export const defaultTablePageSizeOptions = [
  { value: "10", label: "10 rows" },
  { value: "20", label: "20 rows" },
  { value: "25", label: "25 rows" },
  { value: "50", label: "50 rows" },
  { value: "100", label: "100 rows" },
] as const;

export const defaultInterfaceDefaults = {
  defaultLandingPage: "/",
  defaultTablePageSize: 25,
} as const;

export const interfaceDefaultsSchema = z.object({
  defaultLandingPage: z.enum(defaultLandingPages),
  defaultTablePageSize: z.coerce
    .number()
    .int()
    .refine(
      (value) => tablePageSizes.includes(value as (typeof tablePageSizes)[number]),
      "Choose a supported table page size.",
    ),
});

const partialInterfaceDefaultsSchema = interfaceDefaultsSchema.partial();

export type InterfaceDefaults = z.infer<typeof interfaceDefaultsSchema>;

export function parseInterfaceDefaults(value: unknown): InterfaceDefaults {
  const parsed = partialInterfaceDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultInterfaceDefaults;
  }

  return interfaceDefaultsSchema.parse({
    ...defaultInterfaceDefaults,
    ...parsed.data,
  });
}

export function resolveInterfacePageSizeFallback(
  interfaceDefaults: InterfaceDefaults,
  pageSizeOptions: readonly number[],
  fallback: number,
) {
  return pageSizeOptions.includes(interfaceDefaults.defaultTablePageSize)
    ? interfaceDefaults.defaultTablePageSize
    : fallback;
}

export function safeInterfaceLandingPath(path: string) {
  return defaultLandingPages.includes(path as (typeof defaultLandingPages)[number])
    ? path
    : defaultInterfaceDefaults.defaultLandingPage;
}

import { z } from "zod";

export const salesDefaultOwnerModeOptions = [
  { value: "current-user", label: "Current signed-in user" },
  { value: "unassigned", label: "Leave unassigned" },
  { value: "specific-user", label: "Specific user" },
] as const;

const salesOwnerModes = salesDefaultOwnerModeOptions.map(
  (option) => option.value,
) as [SalesOwnerMode, ...SalesOwnerMode[]];

const nullableIdSchema = z.preprocess(
  (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || null;
  },
  z.string().min(1).nullable(),
);

export type SalesOwnerMode =
  | "current-user"
  | "unassigned"
  | "specific-user";

export type SalesDefaults = {
  defaultOwnerMode: SalesOwnerMode;
  defaultOwnerId: string | null;
  defaultSalesPipelineStageId: string | null;
  staleLeadDays: number;
};

export const defaultSalesDefaults: SalesDefaults = {
  defaultOwnerMode: "current-user",
  defaultOwnerId: null,
  defaultSalesPipelineStageId: null,
  staleLeadDays: 7,
};

const salesDefaultsBaseSchema = z.object({
  defaultOwnerMode: z.enum(salesOwnerModes).default(
    defaultSalesDefaults.defaultOwnerMode,
  ),
  defaultOwnerId: nullableIdSchema.default(defaultSalesDefaults.defaultOwnerId),
  defaultSalesPipelineStageId: nullableIdSchema.default(
    defaultSalesDefaults.defaultSalesPipelineStageId,
  ),
  staleLeadDays: z.preprocess(
    (value) => {
      const text = String(value ?? "").trim();
      return text ? text : defaultSalesDefaults.staleLeadDays;
    },
    z.coerce
      .number()
      .int("Enter a whole number of days.")
      .min(1, "Stale lead review must be at least 1 day.")
      .max(90, "Stale lead review cannot exceed 90 days."),
  ),
});

function normaliseSalesDefaults(
  value: z.infer<typeof salesDefaultsBaseSchema>,
): SalesDefaults {
  return {
    defaultOwnerMode: value.defaultOwnerMode,
    defaultOwnerId:
      value.defaultOwnerMode === "specific-user" ? value.defaultOwnerId : null,
    defaultSalesPipelineStageId: value.defaultSalesPipelineStageId,
    staleLeadDays: value.staleLeadDays,
  };
}

export const salesDefaultsSchema = salesDefaultsBaseSchema.transform(
  normaliseSalesDefaults,
);

const partialSalesDefaultsSchema = salesDefaultsBaseSchema.partial();

export function parseSalesDefaults(value: unknown): SalesDefaults {
  const parsed = partialSalesDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultSalesDefaults;
  }

  return salesDefaultsSchema.parse({
    ...defaultSalesDefaults,
    ...parsed.data,
  });
}

export function resolveSalesDefaultOwnerId({
  fallbackUserId,
  salesDefaults,
}: {
  fallbackUserId?: string | null;
  salesDefaults: SalesDefaults;
}) {
  if (salesDefaults.defaultOwnerMode === "unassigned") {
    return null;
  }

  if (salesDefaults.defaultOwnerMode === "specific-user") {
    return salesDefaults.defaultOwnerId ?? fallbackUserId ?? null;
  }

  return fallbackUserId ?? null;
}

import { z } from "zod";

export const moduleToggleKeys = [
  "companies",
  "products",
  "discovery",
  "marketing",
  "telephony",
  "ai",
] as const;

export type ModuleToggleKey = (typeof moduleToggleKeys)[number];

export type ModuleToggles = Record<ModuleToggleKey, boolean>;

export const moduleToggleDefinitions: {
  description: string;
  key: ModuleToggleKey;
  label: string;
}[] = [
  {
    key: "companies",
    label: "Companies",
    description: "Account-level company records alongside people and sales.",
  },
  {
    key: "products",
    label: "Products",
    description: "Catalogue, categories, inventory and product discovery links.",
  },
  {
    key: "discovery",
    label: "Discovery",
    description: "Qualification templates, question banks and lead discovery.",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Attribution, visitors, reporting, tracking and ad platforms.",
  },
  {
    key: "telephony",
    label: "Telephony",
    description: "Phone system, call tracking, softphone and call operations.",
  },
  {
    key: "ai",
    label: "AI / Sidekick",
    description: "CRM Sidekick, AI context and assisted CRM workflows.",
  },
];

export const defaultModuleToggles: ModuleToggles = {
  ai: true,
  companies: true,
  discovery: true,
  marketing: true,
  products: true,
  telephony: true,
};

export const storedModuleTogglesSchema = z.object({
  ai: z.boolean().default(true),
  discovery: z.boolean().default(true),
  marketing: z.boolean().default(true),
  products: z.boolean().default(true),
  telephony: z.boolean().default(true),
});

const partialStoredModuleTogglesSchema = storedModuleTogglesSchema.partial();

export type StoredModuleToggles = z.infer<typeof storedModuleTogglesSchema>;

export function parseStoredModuleToggles(value: unknown): StoredModuleToggles {
  const parsed = partialStoredModuleTogglesSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return storedModuleTogglesSchema.parse({});
  }

  return storedModuleTogglesSchema.parse(parsed.data);
}

export function parseModuleToggles(
  value: unknown,
  companiesEnabled = true,
): ModuleToggles {
  return {
    ...defaultModuleToggles,
    ...parseStoredModuleToggles(value),
    companies: companiesEnabled,
  };
}

export function moduleTogglesToStored(value: ModuleToggles): StoredModuleToggles {
  return storedModuleTogglesSchema.parse({
    ai: value.ai,
    discovery: value.discovery,
    marketing: value.marketing,
    products: value.products,
    telephony: value.telephony,
  });
}

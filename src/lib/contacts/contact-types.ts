import type { ContactCategoryValue } from "@/lib/contacts/categories";

export const systemContactTypeIds = {
  CONSUMER: "contact-type-consumer",
  TRADE: "contact-type-trade",
  INSTALLER: "contact-type-installer",
  COMPANY: "contact-type-company",
} as const satisfies Record<ContactCategoryValue, string>;

export const systemContactTypeSlugs = {
  CONSUMER: "consumer",
  TRADE: "trade",
  INSTALLER: "installer",
  COMPANY: "company",
} as const satisfies Record<ContactCategoryValue, string>;

export function systemContactTypeId(category: ContactCategoryValue) {
  return systemContactTypeIds[category];
}

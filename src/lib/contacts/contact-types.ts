import type { ContactCategoryValue } from "@/lib/contacts/categories";

export type ContactTypeOption = {
  id: string;
  name: string;
  pluralName: string;
  slug: string;
  description: string | null;
  systemKey: ContactCategoryValue | null;
  colourKey: string;
  iconKey: string;
  isDefault: boolean;
  isActive: boolean;
};

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

export function contactTypeSlugBase(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "person-type"
  );
}

export function contactTypeArchiveBlockReason({
  contactCount,
  isDefault,
  name,
}: {
  contactCount: number;
  isDefault: boolean;
  name: string;
}) {
  if (isDefault) return "Choose another default type before archiving this one.";
  if (contactCount > 0) {
    return `Reassign ${contactCount} contact${contactCount === 1 ? "" : "s"} before archiving ${name}.`;
  }
  return null;
}

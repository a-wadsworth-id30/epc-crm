import { ContactCategory } from "@prisma/client";

export const systemContactTypeIds: Record<ContactCategory, string> = {
  [ContactCategory.CONSUMER]: "contact-type-consumer",
  [ContactCategory.TRADE]: "contact-type-trade",
  [ContactCategory.INSTALLER]: "contact-type-installer",
  [ContactCategory.COMPANY]: "contact-type-company",
};

export function systemContactTypeAssignment(
  category: ContactCategory = ContactCategory.CONSUMER,
) {
  return {
    category,
    contactTypeId: systemContactTypeIds[category],
  } as const;
}

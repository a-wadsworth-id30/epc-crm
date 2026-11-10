export const companyTypeSystemKeys = [
  "CUSTOMER",
  "INSTALLER_COMPANY",
  "TRADE_PARTNER",
  "SUPPLIER",
  "SUBCONTRACTOR",
  "OTHER",
] as const;

export type CompanyTypeSystemKeyValue =
  (typeof companyTypeSystemKeys)[number];

export type CompanyTypeOption = {
  id: string;
  name: string;
  pluralName: string;
  slug: string;
  description: string | null;
  systemKey: CompanyTypeSystemKeyValue | null;
  colourKey: string;
  iconKey: string;
  isDefault: boolean;
  isActive: boolean;
};

export const systemCompanyTypeIds = {
  CUSTOMER: "company-type-customer",
  INSTALLER_COMPANY: "company-type-installer-company",
  TRADE_PARTNER: "company-type-trade-partner",
  SUPPLIER: "company-type-supplier",
  SUBCONTRACTOR: "company-type-subcontractor",
  OTHER: "company-type-other",
} as const satisfies Record<CompanyTypeSystemKeyValue, string>;

export const systemCompanyTypeSlugs = {
  CUSTOMER: "customer",
  INSTALLER_COMPANY: "installer-company",
  TRADE_PARTNER: "trade-partner",
  SUPPLIER: "supplier",
  SUBCONTRACTOR: "subcontractor",
  OTHER: "other",
} as const satisfies Record<CompanyTypeSystemKeyValue, string>;

export function systemCompanyTypeId(systemKey: CompanyTypeSystemKeyValue) {
  return systemCompanyTypeIds[systemKey];
}

export function defaultCompanyTypeAssignment() {
  return { companyTypeId: systemCompanyTypeId("OTHER") } as const;
}

export function companyTypeSlugBase(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "company-type"
  );
}

export function companyTypeArchiveBlockReason({
  companyCount,
  isDefault,
  name,
}: {
  companyCount: number;
  isDefault: boolean;
  name: string;
}) {
  if (isDefault) return "Choose another default type before archiving this one.";
  if (companyCount > 0) {
    return `Reassign ${companyCount} compan${companyCount === 1 ? "y" : "ies"} before archiving ${name}.`;
  }
  return null;
}

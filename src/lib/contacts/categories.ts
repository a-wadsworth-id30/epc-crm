export const contactCategoryValues = [
  "CONSUMER",
  "TRADE",
  "INSTALLER",
  "COMPANY",
] as const;

export type ContactCategoryValue = (typeof contactCategoryValues)[number];

type ContactCategoryOption = {
  value: ContactCategoryValue;
  label: string;
  pluralLabel: string;
  description: string;
  examples: string[];
  tableClassName: string;
  cardClassName: string;
  countClassName: string;
};

export const defaultContactCategory: ContactCategoryValue = "CONSUMER";

export const contactCategoryOptions: ContactCategoryOption[] = [
  {
    value: "CONSUMER",
    label: "Consumer",
    pluralLabel: "Consumers",
    description: "Current or potential domestic customers.",
    examples: ["Prospect", "Customer", "Past Customer", "Lost Prospect"],
    tableClassName:
      "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
    cardClassName:
      "border-success-200 bg-success-50/40 dark:border-success-800 dark:bg-success-500/10",
    countClassName:
      "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300",
  },
  {
    value: "TRADE",
    label: "Trade",
    pluralLabel: "Trade",
    description: "Industry professionals EPC works with.",
    examples: ["Architect", "Builder", "Electrician", "Plumber"],
    tableClassName:
      "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
    cardClassName:
      "border-blue-light-200 bg-blue-light-50/40 dark:border-blue-light-800 dark:bg-blue-light-500/10",
    countClassName:
      "bg-blue-light-50 text-blue-light-700 dark:bg-blue-light-500/15 dark:text-blue-light-300",
  },
  {
    value: "INSTALLER",
    label: "Installer",
    pluralLabel: "Installers",
    description: "Members of EPC's installer network.",
    examples: ["Heat pump installer", "Solar installer", "Service engineer"],
    tableClassName:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
    cardClassName:
      "border-purple-200 bg-purple-50/40 dark:border-purple-800 dark:bg-purple-500/10",
    countClassName:
      "bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300",
  },
  {
    value: "COMPANY",
    label: "Company",
    pluralLabel: "Company contacts",
    description: "Organisations, suppliers or business entities.",
    examples: ["Supplier", "Manufacturer", "Distributor", "Partner company"],
    tableClassName:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
    cardClassName:
      "border-orange-200 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-500/10",
    countClassName:
      "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  },
];

export function isContactCategoryValue(
  value: string | null | undefined,
): value is ContactCategoryValue {
  return contactCategoryValues.includes(value as ContactCategoryValue);
}

export function contactCategoryOption(
  value: ContactCategoryValue | null | undefined,
) {
  return (
    contactCategoryOptions.find((option) => option.value === value) ??
    contactCategoryOptions[0]
  );
}

export function contactCategoryLabel(
  value: ContactCategoryValue | null | undefined,
) {
  return contactCategoryOption(value).label;
}

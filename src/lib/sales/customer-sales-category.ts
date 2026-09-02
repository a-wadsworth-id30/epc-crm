import type { CustomerSalesCategory } from "@prisma/client";
import type { SalesStageValue } from "@/lib/sales/lifecycle";

export const customerSalesCategoryValues = [
  "ENQUIRY",
  "OPPORTUNITY",
  "PROJECT",
] as const satisfies CustomerSalesCategory[];

export type CustomerSalesCategoryValue =
  (typeof customerSalesCategoryValues)[number];

export const defaultCustomerSalesCategory: CustomerSalesCategoryValue =
  "ENQUIRY";

export const customerSalesCategoryOptions: Array<{
  value: CustomerSalesCategoryValue;
  label: string;
  pluralLabel: string;
  description: string;
  color: string;
  className: string;
}> = [
  {
    value: "ENQUIRY",
    label: "Enquiry",
    pluralLabel: "Enquiries",
    description:
      "Marketing or inbound leads being worked before they become qualified opportunities.",
    color: "#2563EB",
    className:
      "bg-blue-light-50 text-blue-light-700 ring-blue-light-200 dark:bg-blue-light-500/15 dark:text-blue-light-300 dark:ring-blue-light-500/20",
  },
  {
    value: "OPPORTUNITY",
    label: "Opportunity",
    pluralLabel: "Opportunities",
    description:
      "Qualified customers being scoped, quoted or progressed through the sales process.",
    color: "#7C3AED",
    className:
      "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20",
  },
  {
    value: "PROJECT",
    label: "Project",
    pluralLabel: "Projects",
    description: "Confirmed orders that have become active customer projects.",
    color: "#059669",
    className:
      "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/15 dark:text-success-300 dark:ring-success-500/20",
  },
];

export function isCustomerSalesCategoryValue(
  value: string | null | undefined,
): value is CustomerSalesCategoryValue {
  return customerSalesCategoryValues.includes(
    value as CustomerSalesCategoryValue,
  );
}

export function customerSalesCategoryOption(value: CustomerSalesCategoryValue) {
  return (
    customerSalesCategoryOptions.find((option) => option.value === value) ??
    customerSalesCategoryOptions[0]
  );
}

export function customerSalesCategoryLabel(value: CustomerSalesCategoryValue) {
  return customerSalesCategoryOption(value).label;
}

export function customerSalesCategoryForStage(
  stage: SalesStageValue,
): CustomerSalesCategoryValue {
  if (stage === "WON") return "PROJECT";
  if (stage === "LEAD") return "ENQUIRY";
  return "OPPORTUNITY";
}

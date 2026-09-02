import type { CustomerRelationshipStatus } from "@prisma/client";

export const customerRelationshipStatusValues = [
  "PROSPECT",
  "ACTIVE_CUSTOMER",
  "PAST_CUSTOMER",
  "LOST_PROSPECT",
  "PARTNER",
  "OTHER",
] as const satisfies CustomerRelationshipStatus[];

export type CustomerRelationshipStatusValue =
  (typeof customerRelationshipStatusValues)[number];

export const defaultCustomerRelationshipStatus: CustomerRelationshipStatusValue =
  "PROSPECT";

export const customerRelationshipStatusOptions: Array<{
  value: CustomerRelationshipStatusValue;
  label: string;
  description: string;
  className: string;
}> = [
  {
    value: "PROSPECT",
    label: "Prospect",
    description: "Known contact with potential future work.",
    className:
      "bg-blue-light-50 text-blue-light-700 ring-blue-light-200 dark:bg-blue-light-500/15 dark:text-blue-light-300 dark:ring-blue-light-500/20",
  },
  {
    value: "ACTIVE_CUSTOMER",
    label: "Active customer",
    description: "Current customer with active or recent work.",
    className:
      "bg-success-50 text-success-700 ring-success-200 dark:bg-success-500/15 dark:text-success-300 dark:ring-success-500/20",
  },
  {
    value: "PAST_CUSTOMER",
    label: "Past customer",
    description: "Previous customer with reactivation potential.",
    className:
      "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-white/10 dark:text-gray-300 dark:ring-gray-700",
  },
  {
    value: "LOST_PROSPECT",
    label: "Lost prospect",
    description: "Previously explored work that did not proceed.",
    className:
      "bg-error-50 text-error-700 ring-error-200 dark:bg-error-500/15 dark:text-error-300 dark:ring-error-500/20",
  },
  {
    value: "PARTNER",
    label: "Partner",
    description: "Trade, installer or referral relationship.",
    className:
      "bg-purple-50 text-purple-700 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/20",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Relationship needs a custom note.",
    className:
      "bg-warning-50 text-warning-700 ring-warning-200 dark:bg-warning-500/15 dark:text-warning-300 dark:ring-warning-500/20",
  },
];

export function customerRelationshipStatusOption(
  value: CustomerRelationshipStatusValue,
) {
  return (
    customerRelationshipStatusOptions.find(
      (option) => option.value === value,
    ) ?? customerRelationshipStatusOptions[0]
  );
}

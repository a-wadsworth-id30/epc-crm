import { z } from "zod";

export const notificationCategoryDefinitions = [
  {
    key: "Contacts",
    label: "Contacts",
    description: "New contacts and people activity.",
  },
  {
    key: "Marketing",
    label: "Marketing",
    description: "Attribution, conversion uploads and marketing sync activity.",
  },
  {
    key: "Sales",
    label: "Sales",
    description: "Overdue tasks, blocked tasks and stale pipeline activity.",
  },
  {
    key: "Storage",
    label: "Storage",
    description: "Recent file and media activity.",
  },
  {
    key: "System",
    label: "System",
    description: "Integration, configuration and operational readiness alerts.",
  },
  {
    key: "Telephony",
    label: "Telephony",
    description: "Live queue and missed-call alerts.",
  },
  {
    key: "Tracking",
    label: "Tracking",
    description: "Attribution domains, DNI rules and tracking-number alerts.",
  },
] as const;

export const notificationCategories = notificationCategoryDefinitions.map(
  (category) => category.key,
) as [NotificationCategory, ...NotificationCategory[]];

export type NotificationCategory =
  (typeof notificationCategoryDefinitions)[number]["key"];

export type NotificationSeverity = "critical" | "info" | "warning";

export type NotificationDefaults = {
  categories: Record<NotificationCategory, boolean>;
  showInfoNotifications: boolean;
};

export const defaultNotificationCategories =
  notificationCategoryDefinitions.reduce(
    (categories, category) => ({
      ...categories,
      [category.key]: true,
    }),
    {} as Record<NotificationCategory, boolean>,
  );

export const defaultNotificationDefaults: NotificationDefaults = {
  categories: defaultNotificationCategories,
  showInfoNotifications: true,
};

const notificationCategoriesSchema = z.object({
  Contacts: z.boolean().default(true),
  Marketing: z.boolean().default(true),
  Sales: z.boolean().default(true),
  Storage: z.boolean().default(true),
  System: z.boolean().default(true),
  Telephony: z.boolean().default(true),
  Tracking: z.boolean().default(true),
});

export const notificationDefaultsSchema = z.object({
  categories: notificationCategoriesSchema.default(defaultNotificationCategories),
  showInfoNotifications: z.boolean().default(true),
});

const partialNotificationDefaultsSchema = notificationDefaultsSchema
  .extend({
    categories: notificationCategoriesSchema.partial().optional(),
  })
  .partial();

export function parseNotificationDefaults(value: unknown): NotificationDefaults {
  const parsed = partialNotificationDefaultsSchema.safeParse(value ?? {});

  if (!parsed.success) {
    return defaultNotificationDefaults;
  }

  return notificationDefaultsSchema.parse({
    ...defaultNotificationDefaults,
    ...parsed.data,
    categories: {
      ...defaultNotificationCategories,
      ...parsed.data.categories,
    },
  });
}

export function shouldShowNotification(
  notification: {
    category: NotificationCategory;
    severity: NotificationSeverity;
  },
  defaults: NotificationDefaults,
) {
  if (notification.severity === "critical") {
    return true;
  }

  if (notification.severity === "info" && !defaults.showInfoNotifications) {
    return false;
  }

  return defaults.categories[notification.category];
}

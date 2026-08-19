import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  twilioProvider,
  twilioStoredConfigSchema,
} from "@/lib/integrations/twilio";
import {
  parseNotificationDefaults,
  shouldShowNotification,
  type NotificationCategory,
  type NotificationSeverity,
} from "@/lib/notification-defaults";
import {
  formatBackgroundJobName,
  readBackgroundJobHealthSummary,
} from "@/lib/maintenance/background-jobs";
import { prisma } from "@/lib/prisma";
import { parseSalesDefaults } from "@/lib/sales/defaults";
import { getCrmSettings } from "@/lib/settings";

const headerNotificationCacheTag = "header-notifications";

export type HeaderNotification = {
  id: string;
  category: NotificationCategory;
  detail: string;
  fingerprint: string;
  href: string;
  isRead: boolean;
  canDismiss: boolean;
  reviewedAt: string | null;
  severity: NotificationSeverity;
  title: string;
};

type GeneratedHeaderNotification = Omit<
  HeaderNotification,
  "canDismiss" | "fingerprint" | "isRead" | "reviewedAt"
>;

type DniRuleDelegate = {
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};

function isMissingTable(error: unknown, modelName: string) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === modelName ||
        candidate.meta?.table?.includes(modelName))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === modelName)
  );
}

async function safeCount<T>(
  operation: Promise<T>,
  fallback: T,
  modelName?: string,
) {
  try {
    return await operation;
  } catch (error) {
    if (modelName && isMissingTable(error, modelName)) return fallback;
    throw error;
  }
}

function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function notificationDetail(value: string | null | undefined) {
  const detail = value?.replace(/\s+/g, " ").trim();

  if (!detail) {
    return "Open the linked sales note review task.";
  }

  return detail.length > 180 ? `${detail.slice(0, 177).trimEnd()}...` : detail;
}

async function loadGeneratedHeaderNotificationsUncached(
  currentUserId: string,
): Promise<GeneratedHeaderNotification[]> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const settings = await getCrmSettings();
  const notificationDefaults = parseNotificationDefaults(
    settings.notificationDefaults,
  );
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const staleLeadCutoff = new Date(
    now.getTime() - salesDefaults.staleLeadDays * 24 * 60 * 60 * 1000,
  );
  const dniRuleDelegate = (
    prisma as unknown as { attributionDniRule?: DniRuleDelegate }
  ).attributionDniRule;

  const [
    currentUser,
    twilioConnection,
    activeTrackingNumbers,
    activeDomains,
    recentlySeenDomains,
    activeDniRules,
    recentPhoneFallbacks,
    waitingCalls,
    missedCalls,
    overdueTasks,
    blockedTasks,
    saleNoteMentionTasks,
    overdueSalesOpportunities,
    staleSalesOpportunities,
    newAttributionRecords,
    failedConversionUploads,
    pendingConversionUploads,
    recentMarketingSyncIssues,
    integrationErrors,
    newContacts,
    recentFiles,
    recentAccountRemovalRequests,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    }),
    prisma.integrationConnection.findUnique({
      where: { provider: twilioProvider },
    }),
    prisma.attributionPhoneNumber.count({ where: { isActive: true } }),
    safeCount(
      prisma.attributionDomain.count({ where: { isActive: true } }),
      0,
      "AttributionDomain",
    ),
    safeCount(
      prisma.attributionDomain.count({
        where: {
          isActive: true,
          OR: [
            { lastConfigRequestAt: { gte: dayAgo } },
            { lastScriptSeenAt: { gte: dayAgo } },
          ],
        },
      }),
      0,
      "AttributionDomain",
    ),
    dniRuleDelegate?.count({ where: { isActive: true } }).catch(() => null) ??
      Promise.resolve(null),
    safeCount(
      prisma.attributionDebugEvent.count({
        where: {
          createdAt: { gte: dayAgo },
          eventType: "phone.fallback",
        },
      }),
      0,
      "AttributionDebugEvent",
    ),
    prisma.callQueueEntry.count({
      where: { status: { in: ["WAITING", "CONNECTING"] } },
    }),
    prisma.callLog.count({
      where: {
        direction: "INBOUND",
        status: { in: ["NO_ANSWER", "FAILED", "BUSY", "CANCELED"] },
        startedAt: { gte: dayAgo },
      },
    }),
    prisma.task.count({
      where: {
        assigneeId: currentUserId,
        status: { not: "DONE" },
        dueDate: { lt: now },
      },
    }),
    prisma.task.count({
      where: {
        assigneeId: currentUserId,
        status: "BLOCKED",
      },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: currentUserId,
        metadata: {
          path: ["source"],
          equals: "sale-note-mention",
        },
        status: { not: "DONE" },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        description: true,
        id: true,
        metadata: true,
        title: true,
      },
    }),
    prisma.salesOpportunity.count({
      where: {
        ownerId: currentUserId,
        stage: { notIn: ["WON", "LOST"] },
        expectedCloseDate: { lt: now },
      },
    }),
    prisma.salesOpportunity.count({
      where: {
        ownerId: currentUserId,
        stage: { notIn: ["WON", "LOST"] },
        updatedAt: { lt: staleLeadCutoff },
        OR: [{ nextStep: null }, { nextStep: "" }],
      },
    }),
    prisma.attributionRecord.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.marketingConversionUpload.count({ where: { status: "FAILED" } }),
    prisma.marketingConversionUpload.count({ where: { status: "PENDING" } }),
    prisma.marketingIntegrationSyncLog.count({
      where: {
        startedAt: { gte: dayAgo },
        status: { in: ["ERROR", "WARNING"] },
      },
    }),
    prisma.integrationConnection.count({ where: { status: "ERROR" } }),
    prisma.contact.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.fileAsset.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.auditLog.count({
      where: {
        action: "auth.account_removal.requested",
        createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  const backgroundJobHealth =
    currentUser?.role === "ADMIN"
      ? await readBackgroundJobHealthSummary()
      : null;
  const twilio = twilioStoredConfigSchema.safeParse(
    twilioConnection?.config ?? {},
  );
  const twilioReady = Boolean(
    twilio.success &&
    twilio.data.credentials?.authToken &&
    twilio.data.capabilities.includes("voice") &&
    twilio.data.webhookBaseUrl,
  );
  const notifications: GeneratedHeaderNotification[] = [];

  if (!twilioReady) {
    notifications.push({
      id: "twilio-not-ready",
      category: "System",
      detail: "Voice credentials, capability or webhook base URL is missing.",
      href: "/settings/integrations/twilio",
      severity: "critical",
      title: "Twilio needs attention",
    });
  }

  if (activeTrackingNumbers === 0) {
    notifications.push({
      id: "no-active-tracking-numbers",
      category: "Tracking",
      detail:
        "DNI cannot assign tracking numbers until a pool has active inventory.",
      href: "/telephony/call-tracking/pools",
      severity: "critical",
      title: "No active tracking numbers",
    });
  }

  if (activeDomains === 0) {
    notifications.push({
      id: "no-active-domains",
      category: "Tracking",
      detail:
        "Register an active domain before relying on production tracking.",
      href: "/settings/attribution/domains",
      severity: "warning",
      title: "No active attribution domains",
    });
  } else if (recentlySeenDomains === 0) {
    notifications.push({
      id: "domains-not-seen",
      category: "Tracking",
      detail:
        "No active domain has sent config or script-ready activity in the last 24 hours.",
      href: "/telephony/call-tracking/diagnostics",
      severity: "warning",
      title: "Tracking script not seen recently",
    });
  }

  if (activeDniRules === null) {
    notifications.push({
      id: "dni-client-unavailable",
      category: "System",
      detail:
        "Regenerate Prisma and restart the app if DNI rules are unavailable.",
      href: "/telephony/call-tracking/dni-rules",
      severity: "critical",
      title: "DNI rules client unavailable",
    });
  } else if (activeDniRules === 0) {
    notifications.push({
      id: "no-active-dni-rules",
      category: "Tracking",
      detail:
        "Add at least one active rule or default rule for predictable DNI routing.",
      href: "/telephony/call-tracking/dni-rules",
      severity: "warning",
      title: "No active DNI rules",
    });
  }

  if (recentPhoneFallbacks > 0) {
    notifications.push({
      id: "recent-phone-fallbacks",
      category: "Tracking",
      detail: `${recentPhoneFallbacks} phone fallback event${recentPhoneFallbacks === 1 ? "" : "s"} in the last 24 hours.`,
      href: "/telephony/call-tracking/diagnostics",
      severity: "warning",
      title: "DNI fallback used recently",
    });
  }

  if (waitingCalls > 0) {
    notifications.push({
      id: "waiting-calls",
      category: "Telephony",
      detail: `${waitingCalls} call${waitingCalls === 1 ? " is" : "s are"} waiting or connecting.`,
      href: "/telephony/live",
      severity: "critical",
      title: "Live call queue needs attention",
    });
  }

  if (missedCalls > 0) {
    notifications.push({
      id: "missed-calls",
      category: "Telephony",
      detail: `${missedCalls} missed inbound call${missedCalls === 1 ? "" : "s"} in the last 24 hours.`,
      href: "/telephony/live?view=logs&status=MISSED",
      severity: "warning",
      title: "Missed calls to review",
    });
  }

  for (const task of saleNoteMentionTasks) {
    const metadata = jsonObject(task.metadata);
    const opportunityId = stringValue(metadata.opportunityId);

    notifications.push({
      id: `sale-note-mention:${task.id}`,
      category: "Sales",
      detail: notificationDetail(task.description),
      href: opportunityId ? `/sales/${opportunityId}` : "/tasks",
      severity: "warning",
      title: task.title || "Sales note mention",
    });
  }

  if (overdueTasks > 0) {
    notifications.push({
      id: "overdue-tasks",
      category: "Sales",
      detail: `${overdueTasks} assigned task${overdueTasks === 1 ? " is" : "s are"} overdue.`,
      href: "/tasks",
      severity: "warning",
      title: "Overdue follow-up tasks",
    });
  }

  if (blockedTasks > 0) {
    notifications.push({
      id: "blocked-tasks",
      category: "Sales",
      detail: `${blockedTasks} assigned task${blockedTasks === 1 ? " is" : "s are"} blocked.`,
      href: "/tasks",
      severity: "warning",
      title: "Blocked tasks need review",
    });
  }

  if (overdueSalesOpportunities > 0) {
    notifications.push({
      id: "overdue-sales-opportunities",
      category: "Sales",
      detail: `${overdueSalesOpportunities} open sale${overdueSalesOpportunities === 1 ? " has" : "s have"} passed the expected close date.`,
      href: "/sales",
      severity: "warning",
      title: "Pipeline close dates overdue",
    });
  }

  if (staleSalesOpportunities > 0) {
    notifications.push({
      id: "stale-sales-opportunities",
      category: "Sales",
      detail: `${staleSalesOpportunities} assigned open sale${staleSalesOpportunities === 1 ? " has" : "s have"} no next step and no update in ${salesDefaults.staleLeadDays} day${salesDefaults.staleLeadDays === 1 ? "" : "s"}.`,
      href: "/sales",
      severity: "warning",
      title: "Stale sales need next steps",
    });
  }

  if (newAttributionRecords > 0) {
    notifications.push({
      id: "new-attribution-records",
      category: "Marketing",
      detail: `${newAttributionRecords} form or call attribution record${newAttributionRecords === 1 ? "" : "s"} captured in the last 24 hours.`,
      href: "/marketing/visitors",
      severity: "info",
      title: "New tracked visitor activity",
    });
  }

  if (failedConversionUploads > 0) {
    notifications.push({
      id: "failed-conversion-uploads",
      category: "Marketing",
      detail: `${failedConversionUploads} conversion upload${failedConversionUploads === 1 ? " has" : "s have"} failed provider feedback.`,
      href: "/marketing/conversion-reporting",
      severity: "warning",
      title: "Conversion uploads failed",
    });
  }

  if (pendingConversionUploads > 0) {
    notifications.push({
      id: "pending-conversion-uploads",
      category: "Marketing",
      detail: `${pendingConversionUploads} conversion upload${pendingConversionUploads === 1 ? " is" : "s are"} waiting to be processed.`,
      href: "/marketing/conversion-reporting",
      severity: "info",
      title: "Conversion uploads pending",
    });
  }

  if (recentMarketingSyncIssues > 0) {
    notifications.push({
      id: "marketing-sync-issues",
      category: "Marketing",
      detail: `${recentMarketingSyncIssues} provider sync issue${recentMarketingSyncIssues === 1 ? "" : "s"} logged in the last 24 hours.`,
      href: "/marketing/ad-platforms",
      severity: "warning",
      title: "Marketing sync needs review",
    });
  }

  if (
    currentUser?.role === "ADMIN" &&
    backgroundJobHealth?.available &&
    backgroundJobHealth.staleRunningCount > 0
  ) {
    notifications.push({
      id: "stale-background-jobs",
      category: "System",
      detail: `${backgroundJobHealth.staleRunningCount} background job${
        backgroundJobHealth.staleRunningCount === 1 ? " has" : "s have"
      } been running for more than ${backgroundJobHealth.staleMinutes} minutes.`,
      href: "/settings/system",
      severity: "critical",
      title: "Background job appears stuck",
    });
  }

  if (
    currentUser?.role === "ADMIN" &&
    backgroundJobHealth?.available &&
    backgroundJobHealth.recentErrorCount > 0
  ) {
    const latestErrorName = backgroundJobHealth.latestError
      ? formatBackgroundJobName(backgroundJobHealth.latestError.jobName)
      : "Unknown job";

    notifications.push({
      id: "failed-background-jobs",
      category: "System",
      detail: `${backgroundJobHealth.recentErrorCount} background job error${
        backgroundJobHealth.recentErrorCount === 1 ? "" : "s"
      } in the last ${
        backgroundJobHealth.recentErrorDays
      } days. Latest: ${latestErrorName}.`,
      href: "/settings/system",
      severity: "warning",
      title: "Background jobs failed",
    });
  }

  if (integrationErrors > 0) {
    notifications.push({
      id: "integration-errors",
      category: "System",
      detail: `${integrationErrors} integration connection${integrationErrors === 1 ? " is" : "s are"} reporting an error state.`,
      href: "/settings/integrations",
      severity: "critical",
      title: "Integration errors detected",
    });
  }

  if (currentUser?.role === "ADMIN" && recentAccountRemovalRequests > 0) {
    notifications.push({
      id: "account-removal-requests",
      category: "System",
      detail: `${recentAccountRemovalRequests} account removal request${recentAccountRemovalRequests === 1 ? "" : "s"} logged in the last 30 days.`,
      href: "/settings/security",
      severity: "warning",
      title: "Account removal request pending review",
    });
  }

  if (newContacts > 0) {
    notifications.push({
      id: "new-contacts",
      category: "Contacts",
      detail: `${newContacts} contact${newContacts === 1 ? "" : "s"} added in the last 24 hours.`,
      href: "/contacts",
      severity: "info",
      title: "New contacts added",
    });
  }

  if (recentFiles > 0) {
    notifications.push({
      id: "recent-files",
      category: "Storage",
      detail: `${recentFiles} file${recentFiles === 1 ? "" : "s"} uploaded in the last 24 hours.`,
      href: "/storage",
      severity: "info",
      title: "Recent storage activity",
    });
  }

  if (!notifications.length) {
    notifications.push({
      id: "all-clear",
      category: "System",
      detail:
        "No urgent tracking, telephony, sales, marketing, integration or storage alerts were found.",
      href: "/",
      severity: "info",
      title: "No action needed",
    });
  }

  return notifications
    .filter((notification) =>
      shouldShowNotification(notification, notificationDefaults),
    )
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

function loadGeneratedHeaderNotifications(currentUserId: string) {
  return unstable_cache(
    () => loadGeneratedHeaderNotificationsUncached(currentUserId),
    ["header-notifications", currentUserId],
    { revalidate: 60, tags: [headerNotificationCacheTag] },
  )();
}

export function revalidateHeaderNotifications() {
  revalidateTag(headerNotificationCacheTag, "max");
}

function createNotificationFingerprint(notification: GeneratedHeaderNotification) {
  return createHash("sha256")
    .update(
      [
        notification.id,
        notification.category,
        notification.severity,
        notification.title,
        notification.detail,
        notification.href,
      ].join("\u001f"),
    )
    .digest("hex");
}

async function applyNotificationState(
  currentUserId: string,
  generatedNotifications: GeneratedHeaderNotification[],
): Promise<HeaderNotification[]> {
  if (!generatedNotifications.length) return [];

  const notificationIds = generatedNotifications.map(
    (notification) => notification.id,
  );
  const states = await prisma.notificationState.findMany({
    where: {
      userId: currentUserId,
      notificationId: { in: notificationIds },
    },
  });
  const stateByNotificationId = new Map(
    states.map((state) => [state.notificationId, state]),
  );
  const notifications = generatedNotifications.flatMap((notification) => {
    const fingerprint = createNotificationFingerprint(notification);
    const state = stateByNotificationId.get(notification.id);
    const stateMatchesCurrentAlert = state?.fingerprint === fingerprint;
    const isDismissed =
      notification.severity !== "critical" &&
      stateMatchesCurrentAlert &&
      Boolean(state.dismissedAt);

    if (isDismissed) return [];

    const seenAt =
      stateMatchesCurrentAlert && state?.seenAt ? state.seenAt : null;

    return [
      {
        ...notification,
        canDismiss: notification.severity !== "critical",
        fingerprint,
        isRead: Boolean(seenAt),
        reviewedAt: seenAt?.toISOString() ?? null,
      },
    ];
  });

  return notifications.slice(0, 12);
}

export async function loadHeaderNotifications(currentUserId: string) {
  const generatedNotifications =
    await loadGeneratedHeaderNotifications(currentUserId);

  return applyNotificationState(currentUserId, generatedNotifications);
}

async function markNotificationState({
  currentUserId,
  dismiss,
  notification,
}: {
  currentUserId: string;
  dismiss: boolean;
  notification: GeneratedHeaderNotification;
}) {
  const now = new Date();
  const fingerprint = createNotificationFingerprint(notification);
  const dismissedAt =
    dismiss && notification.severity !== "critical" ? now : null;

  await prisma.notificationState.upsert({
    where: {
      userId_notificationId: {
        userId: currentUserId,
        notificationId: notification.id,
      },
    },
    update: {
      dismissedAt,
      fingerprint,
      seenAt: now,
    },
    create: {
      dismissedAt,
      fingerprint,
      notificationId: notification.id,
      seenAt: now,
      userId: currentUserId,
    },
  });
}

export async function markHeaderNotificationReviewed(
  currentUserId: string,
  notificationId: string,
) {
  const generatedNotifications =
    await loadGeneratedHeaderNotifications(currentUserId);
  const notification = generatedNotifications.find(
    (item) => item.id === notificationId,
  );

  if (!notification) {
    return applyNotificationState(currentUserId, generatedNotifications);
  }

  await markNotificationState({
    currentUserId,
    dismiss: false,
    notification,
  });

  return applyNotificationState(currentUserId, generatedNotifications);
}

export async function dismissHeaderNotification(
  currentUserId: string,
  notificationId: string,
) {
  const generatedNotifications =
    await loadGeneratedHeaderNotifications(currentUserId);
  const notification = generatedNotifications.find(
    (item) => item.id === notificationId,
  );

  if (!notification) {
    return applyNotificationState(currentUserId, generatedNotifications);
  }

  await markNotificationState({
    currentUserId,
    dismiss: notification.severity !== "critical",
    notification,
  });

  return applyNotificationState(currentUserId, generatedNotifications);
}

export async function markAllHeaderNotificationsReviewed(currentUserId: string) {
  const generatedNotifications =
    await loadGeneratedHeaderNotifications(currentUserId);

  await Promise.all(
    generatedNotifications.map((notification) =>
      markNotificationState({
        currentUserId,
        dismiss: false,
        notification,
      }),
    ),
  );

  return applyNotificationState(currentUserId, generatedNotifications);
}

function severityRank(severity: HeaderNotification["severity"]) {
  if (severity === "critical") return 0;
  if (severity === "warning") return 1;
  return 2;
}

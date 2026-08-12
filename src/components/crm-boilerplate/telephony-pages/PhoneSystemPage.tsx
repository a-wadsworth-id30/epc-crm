import type { Prisma } from "@prisma/client";
import Link from "next/link";
import type { z } from "zod";
import type { AgentManagerRow } from "@/components/crm-boilerplate/AgentsManager";
import type { BusinessNumberRow } from "@/components/crm-boilerplate/BusinessNumbersManager";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import {
  AgentsManager,
  BusinessHoursSettingsForm,
  BusinessNumbersManager,
  CallLogWorkspace,
  CallRecordingSettingsForm,
  CallRouteForm,
  CallRoutingFlowBuilder,
  LiveQueueTimer,
  QueueCallAdminActions,
  QueueSettingsForm,
  RecordingsWorkspace,
  TelephonyRealtimePageRefresh,
  TwilioSettingsForm,
} from "@/components/crm-boilerplate/LazyTelephonyClientPanels";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import { hasCredentialEncryptionKey } from "@/lib/crypto/secrets";
import {
  hasStoredTwilioCredentials,
  twilioRecordingSettingsSchema,
  twilioStoredConfigSchema,
} from "@/lib/integrations/twilio";
import { getPhoneSystemConfig } from "@/lib/phone-system/config";
import { prisma } from "@/lib/prisma";
import { realtimeTopics } from "@/lib/realtime/topic-names";
import { routingAttempts, routingTransitions } from "@/lib/telephony/call-routing";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import {
  browserAvailabilityTtlMs,
  displayUserName,
  liveCallWhere,
  liveQueueWhere,
  targetForUser,
} from "@/lib/telephony/twilio-voice";
import {
  phoneTabAliases,
  phoneTabs,
  type PhoneTab,
  type PhoneTabIconName,
} from "@/lib/telephony/navigation";
import {
  loadCallLogPage,
  normalizeCallDirectionFilter,
  normalizeCallLogPage,
  normalizeCallLogPageSize,
  normalizeCallStatusFilter,
  normalizeMonitoringView,
  paramValue,
  type CallDirectionFilter,
  type CallStatusFilter,
  type MonitoringView,
} from "@/lib/telephony/call-log";
import {
  loadRecordingPage,
  normalizeRecordingFilter,
  normalizeRecordingPage,
  normalizeRecordingPageSize,
} from "@/lib/telephony/recordings";
import type {
  RecordingFilter,
  RecordingPage,
} from "@/lib/telephony/recordings-shared";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  activeTab?: PhoneTab;
};

const recentCallSelect = {
  id: true,
  direction: true,
  status: true,
  fromNumber: true,
  toNumber: true,
  recordingSid: true,
  durationSeconds: true,
  metadata: true,
  startedAt: true,
  answeredAt: true,
  contact: { select: { firstName: true, lastName: true } },
  opportunity: { select: { title: true } },
  user: { select: { name: true } },
} satisfies Prisma.CallLogSelect;

const answerTimingSelect = {
  startedAt: true,
  answeredAt: true,
} satisfies Prisma.CallLogSelect;

const activeQueueEntrySelect = {
  id: true,
  assignedUserId: true,
  fromNumber: true,
  metadata: true,
  queuedAt: true,
  status: true,
  assignedUser: { select: { id: true, name: true } },
  contact: { select: { firstName: true, lastName: true } },
  opportunity: { select: { title: true } },
} satisfies Prisma.CallQueueEntrySelect;

function formatDate(date: Date | null) {
  if (!date) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function effectiveVoiceAvailability(user: {
  voiceAvailability: string;
  voiceLastSeenAt: Date | null;
  voiceRoutingMode: string;
}) {
  const requiresBrowserPresence =
    user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX";

  if (!requiresBrowserPresence) return user.voiceAvailability;

  if (
    !user.voiceLastSeenAt ||
    Date.now() - user.voiceLastSeenAt.getTime() > browserAvailabilityTtlMs
  ) {
    return "OFFLINE";
  }

  return user.voiceAvailability;
}

function secondsSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
}

function averageAnswerSecondsForCalls(
  calls: Array<{ answeredAt: Date | null; startedAt: Date }>,
) {
  const answeredCalls = calls.filter((call) => call.answeredAt);

  return answeredCalls.length
    ? Math.round(
        answeredCalls.reduce((total, call) => {
          if (!call.answeredAt) return total;

          return (
            total + Math.max(0, secondsSince(call.startedAt) - secondsSince(call.answeredAt))
          );
        }, 0) / answeredCalls.length,
      )
    : 0;
}

function agentInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default async function PhoneSystemPage({ activeTab: forcedActiveTab, searchParams }: PageProps) {
  await requireAdmin();

  const params = (await searchParams) ?? {};
  const requestedTab = paramValue(params.tab);
  const monitoringView = normalizeMonitoringView(paramValue(params.view));
  const callLogQuery = (paramValue(params.q) ?? "").trim();
  const callLogDirection = normalizeCallDirectionFilter(paramValue(params.direction));
  const callLogStatus = normalizeCallStatusFilter(paramValue(params.status));
  const callLogPageNumber = normalizeCallLogPage(paramValue(params.page));
  const callLogPageSize = normalizeCallLogPageSize(paramValue(params.pageSize));
  const selectedCallLogId = paramValue(params.call) ?? null;
  const recordingQuery = (paramValue(params.q) ?? "").trim();
  const recordingFilter = normalizeRecordingFilter(paramValue(params.filter));
  const recordingPageNumber = normalizeRecordingPage(paramValue(params.page));
  const recordingPageSize = normalizeRecordingPageSize(paramValue(params.pageSize));
  const normalizedRequestedTab = requestedTab ? phoneTabAliases[requestedTab] ?? requestedTab : null;
  const activeTab = forcedActiveTab ?? (phoneTabs.some((tab) => tab.id === normalizedRequestedTab)
    ? (normalizedRequestedTab as PhoneTab)
    : "dashboard");
  const shouldLiveRefresh =
    activeTab === "dashboard" ||
    activeTab === "agents" ||
    activeTab === "routing-ivr" ||
    (activeTab === "live-monitoring" && monitoringView === "live");
  const liveRefreshIntervalMs =
    activeTab === "live-monitoring" ? 5_000 : 30_000;
  const shouldShowTelephonyStatusStrip =
    activeTab !== "dashboard" &&
    activeTab !== "routing-ivr" &&
    activeTab !== "live-monitoring" &&
    activeTab !== "recordings";
  const shouldLoadDashboardRecentCalls = activeTab === "dashboard";
  const shouldLoadAnswerTiming =
    shouldShowTelephonyStatusStrip && !shouldLoadDashboardRecentCalls;
  const shouldLoadQueueEntries =
    activeTab === "dashboard" ||
    activeTab === "routing-ivr" ||
    (activeTab === "live-monitoring" && monitoringView === "live");
  const shouldLoadMissedCallTasks = activeTab === "dashboard";
  const shouldLoadBusinessNumbers =
    activeTab === "business-numbers" || activeTab === "settings";
  const shouldLoadCallLogPage =
    activeTab === "live-monitoring" && monitoringView === "logs";
  const shouldLoadRecordingPage = activeTab === "recordings";

  const [
    users,
    connection,
    recentCalls,
    answerTimingCalls,
    activeQueueCount,
    activeQueueEntries,
    missedCallTasks,
    activeCallCount,
    phoneConfig,
    businessNumbers,
    callLogPage,
    recordingPage,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ firstName: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        email: true,
        mobile: true,
        landline: true,
        voiceRoutingMode: true,
        voiceExtension: true,
        voiceAvailability: true,
        voiceLastSeenAt: true,
        sipAddress: true,
      },
    }),
    prisma.integrationConnection.findUnique({ where: { provider: "twilio" } }),
    shouldLoadDashboardRecentCalls
      ? prisma.callLog.findMany({
          orderBy: { startedAt: "desc" },
          take: 10,
          select: recentCallSelect,
        })
      : Promise.resolve([]),
    shouldLoadAnswerTiming
      ? prisma.callLog.findMany({
          where: { answeredAt: { not: null } },
          orderBy: { startedAt: "desc" },
          take: 10,
          select: answerTimingSelect,
        })
      : Promise.resolve([]),
    prisma.callQueueEntry.count({ where: liveQueueWhere() }),
    shouldLoadQueueEntries
      ? prisma.callQueueEntry.findMany({
          where: liveQueueWhere(),
          orderBy: { queuedAt: "desc" },
          take: 12,
          select: activeQueueEntrySelect,
        })
      : Promise.resolve([]),
    shouldLoadMissedCallTasks
      ? prisma.task.count({
          where: {
            status: { not: "DONE" },
            metadata: { path: ["type"], equals: "MISSED_CALL" },
          },
        })
      : Promise.resolve(0),
    prisma.callLog.count({ where: liveCallWhere() }),
    getPhoneSystemConfig(),
    shouldLoadBusinessNumbers
      ? prisma.businessPhoneNumber.findMany({
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        })
      : Promise.resolve([]),
    shouldLoadCallLogPage
      ? loadCallLogPage({
          direction: callLogDirection,
          page: callLogPageNumber,
          pageSize: callLogPageSize,
          query: callLogQuery,
          selectedCallId: selectedCallLogId,
          status: callLogStatus,
        })
      : Promise.resolve(null),
    shouldLoadRecordingPage
      ? loadRecordingPage({
          filter: recordingFilter,
          page: recordingPageNumber,
          pageSize: recordingPageSize,
          query: recordingQuery,
        })
      : Promise.resolve(null),
  ]);

  const parsedTwilio = twilioStoredConfigSchema.safeParse(connection?.config ?? {});
  const twilioConfig = parsedTwilio.success ? parsedTwilio.data : null;
  const baseUrl = twilioConfig?.webhookBaseUrl?.replace(/\/$/, "") ?? "";
  const voiceWebhook = baseUrl
    ? `${baseUrl}/api/webhooks/twilio/voice`
    : "/api/webhooks/twilio/voice";
  const messagingWebhook = baseUrl
    ? `${baseUrl}/api/webhooks/twilio/messaging`
    : "/api/webhooks/twilio/messaging";
  const voiceReady = Boolean(
    twilioConfig?.accountSid &&
      twilioConfig.twimlAppSid &&
      twilioConfig.voiceCallerId &&
      twilioConfig.webhookBaseUrl &&
      hasStoredTwilioCredentials(twilioConfig),
  );
  const numberPurchaseReady = Boolean(
    twilioConfig?.accountSid &&
      twilioConfig.webhookBaseUrl &&
      hasStoredTwilioCredentials(twilioConfig),
  );
  const recordingSettings = twilioRecordingSettingsSchema.parse(
    twilioConfig?.recording ?? {},
  );
  const agentSettingsByUserId = new Map(
    phoneConfig.agentSettings.map((settings) => [settings.userId, settings]),
  );
  const visibleUsers = users.map((user) => ({
    ...user,
    displayName:
      [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name,
    voiceAvailability: agentSettingsByUserId.get(user.id)?.forceUnavailable
      ? "OFFLINE"
      : effectiveVoiceAvailability(user),
    phoneSystemSettings: agentSettingsByUserId.get(user.id) ?? null,
  }));
  const availableStaff = visibleUsers.filter(
    (user) => user.voiceAvailability === "AVAILABLE" && Boolean(targetForUser(user)),
  ).length;
  const routableStaff = visibleUsers.filter((user) => Boolean(targetForUser(user))).length;
  const routeAgents = visibleUsers
    .filter(
      (user) =>
        user.voiceAvailability === "AVAILABLE" && Boolean(targetForUser(user)),
    )
    .map((user) => ({ id: user.id, name: displayUserName(user) }));
  const averageAnswerSeconds = averageAnswerSecondsForCalls(
    shouldLoadDashboardRecentCalls ? recentCalls : answerTimingCalls,
  );
  const readyChecks = [
    Boolean(hasStoredTwilioCredentials(twilioConfig)),
    Boolean(twilioConfig?.twimlAppSid),
    Boolean(twilioConfig?.voiceCallerId),
    Boolean(twilioConfig?.webhookBaseUrl),
    Boolean(recordingSettings.enabled && twilioConfig?.voiceIntelligenceServiceSid),
  ];
  const readyCount = readyChecks.filter(Boolean).length;
  const systemStatus = voiceReady
    ? activeQueueCount > 0
      ? "Routing live calls"
      : availableStaff > 0
        ? "Ready for calls"
        : "No agents available"
    : "Setup required";
  const readinessChecks = [
    {
      label: "Twilio credentials",
      detail: "Account SID and auth token",
      ready: readyChecks[0],
    },
    {
      label: "Voice application",
      detail: "TwiML app SID",
      ready: readyChecks[1],
    },
    {
      label: "Caller ID",
      detail: "Outbound number",
      ready: readyChecks[2],
    },
    {
      label: "Webhook URL",
      detail: "Public CRM callback base",
      ready: readyChecks[3],
    },
    {
      label: "AI call analysis",
      detail: "Recording intelligence service",
      ready: readyChecks[4],
    },
  ];
  const businessNumberRows = businessNumbers.map((number): BusinessNumberRow => {
    const routing = businessNumberRouting({
      number: number.phoneNumber,
      routingFlow: phoneConfig.routingFlow,
      status: number.status,
      voiceCallerId: twilioConfig?.voiceCallerId ?? null,
    });

    return {
      id: number.id,
      phoneNumber: number.phoneNumber,
      label: number.label,
      twilioPhoneNumberSid: number.twilioPhoneNumberSid,
      country: number.country,
      numberType: number.numberType,
      status: number.status,
      capabilities: businessNumberCapabilities(number.capabilities),
      createdAt: number.createdAt.toISOString(),
      releasedAt: number.releasedAt?.toISOString() ?? null,
      routingStatus: routing.status,
      routingLabel: routing.label,
    };
  });
  const activeSmsCapableNumberCount = businessNumberRows.filter(
    (number) => number.status === "ACTIVE" && Boolean(number.capabilities?.sms),
  ).length;
  const agentRows = visibleUsers.map((user): AgentManagerRow => {
    const settings = user.phoneSystemSettings;
    const assignedQueueIds = settings?.assignedQueueIds.length
      ? settings.assignedQueueIds
      : phoneConfig.queues
          .filter((queue) => queue.assignedAgentIds.includes(user.id))
          .map((queue) => queue.id);

    return {
      id: user.id,
      avatarUrl: user.avatarUrl,
      displayName: user.displayName,
      email: user.email,
      mobile: user.mobile,
      landline: user.landline,
      sipAddress: user.sipAddress,
      voiceAvailability: user.voiceAvailability,
      voiceExtension: user.voiceExtension,
      voiceLastSeenAt: user.voiceLastSeenAt?.toISOString() ?? null,
      voiceRoutingMode: user.voiceRoutingMode,
      routeTarget: targetForUser(user),
      assignedQueueIds,
      maxConcurrentCalls: settings?.maxConcurrentCalls ?? 1,
      forceUnavailable: settings?.forceUnavailable ?? false,
      awayReason: settings?.awayReason ?? "",
    };
  });

  return (
    <>
      {shouldLiveRefresh && (
        <TelephonyRealtimePageRefresh
          browserEvents={["id30:softphone-availability-updated"]}
          fallbackIntervalMs={Math.max(liveRefreshIntervalMs, 60000)}
          minRefreshIntervalMs={liveRefreshIntervalMs}
          topics={[realtimeTopics.telephony, realtimeTopics.tasks]}
        />
      )}
      <PageHeader
        title="Phone system"
        description="Manage phone numbers, agents, teams, routing, business hours and recordings."
        actions={
          <Link
            href="/settings/integrations/twilio"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Twilio setup
          </Link>
        }
      />

      <PhoneTabs activeTab={activeTab} />

      {shouldShowTelephonyStatusStrip && (
        <TelephonyStatusStrip
          activeCallCount={activeCallCount}
          activeQueueCount={activeQueueCount}
          averageAnswerSeconds={averageAnswerSeconds}
          readinessChecks={readinessChecks}
          readyCount={readyCount}
          routableStaff={routableStaff}
          systemStatus={systemStatus}
          voiceReady={voiceReady}
        />
      )}

      <div className="mt-6">
        {activeTab === "dashboard" && (
          <DashboardTab
            activeCallCount={activeCallCount}
            activeQueueCount={activeQueueCount}
            activeQueueEntries={activeQueueEntries}
            averageAnswerSeconds={averageAnswerSeconds}
            availableStaff={availableStaff}
            messagingWebhook={messagingWebhook}
            missedCallTasks={missedCallTasks}
            readinessChecks={readinessChecks}
            recentCalls={recentCalls}
            routeAgents={routeAgents}
            users={visibleUsers}
            voiceReady={voiceReady}
            voiceWebhook={voiceWebhook}
          />
        )}
        {activeTab === "business-numbers" && (
          <BusinessNumbersTab
            numbers={businessNumberRows}
            twilioReady={numberPurchaseReady}
          />
        )}
        {activeTab === "agents" && (
          <AgentsTab
            queues={phoneConfig.queues}
            users={agentRows}
          />
        )}
        {activeTab === "call-groups" && (
          <CallGroupsTab
            activeQueueCount={activeQueueCount}
            queues={phoneConfig.queues}
            users={visibleUsers}
          />
        )}
        {activeTab === "routing-ivr" && (
          <RoutingIvrTab
            activeQueueEntries={activeQueueEntries}
            configRules={phoneConfig.routingRules}
            routingFlow={phoneConfig.routingFlow}
            queues={phoneConfig.queues}
            routeAgents={routeAgents}
            users={visibleUsers}
          />
        )}
        {activeTab === "business-hours" && (
          <BusinessHoursTab
            afterHours={phoneConfig.businessHours.afterHours}
            holidays={phoneConfig.businessHours.holidays}
            queues={phoneConfig.queues}
            timezone={phoneConfig.businessHours.timezone}
            weekly={phoneConfig.businessHours.weekly}
          />
        )}
        {activeTab === "live-monitoring" && (
          <MonitoringTab
            activeQueueCount={activeQueueCount}
            activeQueueEntries={activeQueueEntries}
            callLogDirection={callLogDirection}
            callLogPage={callLogPage}
            callLogQuery={callLogQuery}
            callLogStatus={callLogStatus}
            view={monitoringView}
            routeAgents={routeAgents}
            users={visibleUsers}
          />
        )}
        {activeTab === "recordings" && (
          recordingPage ? (
            <RecordingsTab
              baseUrl={baseUrl}
              initialFilter={recordingFilter}
              initialQuery={recordingQuery}
              recordingPage={recordingPage}
              recordingSettings={recordingSettings}
              voiceIntelligenceServiceSid={twilioConfig?.voiceIntelligenceServiceSid ?? ""}
            />
          ) : null
        )}
        {activeTab === "settings" && (
          <SettingsTab
            phoneConfigUpdatedAt={phoneConfig.updatedAt}
            canEdit
            hasEncryptionKey={hasCredentialEncryptionKey()}
            hasStoredCredentials={hasStoredTwilioCredentials(twilioConfig)}
            messagingWebhook={messagingWebhook}
            numberPurchaseReady={numberPurchaseReady}
            readinessChecks={readinessChecks}
            smsCapableNumberCount={activeSmsCapableNumberCount}
            twilioConfig={twilioConfig}
            voiceWebhook={voiceWebhook}
          />
        )}
      </div>
    </>
  );
}

function PhoneTabs({ activeTab }: { activeTab: PhoneTab }) {
  return (
    <nav
      aria-label="Phone system sections"
      className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:w-max sm:min-w-max">
        {phoneTabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition sm:px-4 ${
                active ? "order-first md:order-none" : ""
              } ${
                active
                  ? "bg-brand-500 text-white shadow-theme-xs"
                  : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              }`}
            >
              <PhoneIcon name={tab.icon} className="h-4 w-4" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type DashboardAttentionItem = {
  count: number;
  detail: string;
  href: string;
  icon: IconName;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
};

function DashboardTab({
  activeQueueCount,
  activeQueueEntries,
  activeCallCount,
  averageAnswerSeconds,
  availableStaff,
  messagingWebhook,
  missedCallTasks,
  readinessChecks,
  recentCalls,
  routeAgents,
  users,
  voiceReady,
  voiceWebhook,
}: {
  activeCallCount: number;
  activeQueueCount: number;
  activeQueueEntries: Array<QueueEntry>;
  averageAnswerSeconds: number;
  availableStaff: number;
  messagingWebhook: string;
  missedCallTasks: number;
  readinessChecks: Array<{ detail: string; label: string; ready: boolean }>;
  recentCalls: Array<RecentCall>;
  routeAgents: { id: string; name: string }[];
  users: Array<VisibleUser>;
  voiceReady: boolean;
  voiceWebhook: string;
}) {
  const inactiveBrowserAgents = users.filter(
    (user) =>
      (user.voiceRoutingMode === "BROWSER" || user.voiceRoutingMode === "FLEX") &&
      user.voiceAvailability === "OFFLINE",
  ).length;
  const recordingCount = recentCalls.filter((call) => call.recordingSid).length;
  const needsTranscriptCount = recentCalls.filter((call) => {
    const metadata = recordMetadata(call.metadata);
    return call.recordingSid && !stringMetadata(metadata, "transcriptStatus");
  }).length;
  const latestQueueEntry = activeQueueEntries[0] ?? null;
  const latestContactName = latestQueueEntry
    ? [latestQueueEntry.contact?.firstName, latestQueueEntry.contact?.lastName]
        .filter(Boolean)
        .join(" ")
    : "";
  const systemState = voiceReady
    ? activeQueueCount
      ? "Live calls need attention"
      : availableStaff
        ? "Ready for calls"
        : "No agents available"
    : "Setup required";
  const attentionItems: DashboardAttentionItem[] = [
    {
      count: activeQueueCount,
      detail: latestQueueEntry
        ? latestContactName || latestQueueEntry.fromNumber || "Caller waiting"
        : "Queue is clear",
      href: "/telephony/live",
      icon: "pulse" as IconName,
      label: "Live queue",
      tone: activeQueueCount ? "warning" : "success",
    },
    {
      count: missedCallTasks,
      detail: "Open missed-call follow-ups",
      href: "/tasks",
      icon: "alert" as IconName,
      label: "Follow-ups",
      tone: missedCallTasks ? "danger" : "neutral",
    },
    {
      count: inactiveBrowserAgents,
      detail: "Browser softphone users offline",
      href: "/telephony/users",
      icon: "users" as IconName,
      label: "Inactive agents",
      tone: inactiveBrowserAgents ? "warning" : "success",
    },
    {
      count: needsTranscriptCount,
      detail: "Recordings without transcript status",
      href: "/telephony/recordings",
      icon: "record" as IconName,
      label: "Transcripts",
      tone: needsTranscriptCount ? "warning" : "neutral",
    },
  ];

  return (
    <div className="space-y-5">
      <DashboardCommandHeader
        activeCallCount={activeCallCount}
        activeQueueCount={activeQueueCount}
        averageAnswerSeconds={averageAnswerSeconds}
        availableStaff={availableStaff}
        missedCallTasks={missedCallTasks}
        routeAgents={routeAgents.length}
        state={systemState}
        voiceReady={voiceReady}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <DashboardAttentionPanel items={attentionItems} />
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Detailed workspaces
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Open the right telephony view
              </h3>
              <LazyHelpTooltip content="Provides shortcuts to the telephony workspace that matches the user's current task, such as live calls, routing or recordings." />
            </div>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <DashboardActionLink
              detail="Queue state, attempts and manual routing"
              href="/telephony/live"
              icon="pulse"
              label="Monitoring"
              strong
            />
            <DashboardActionLink
              detail="SmartFlow builder and route diagnostics"
              href="/telephony/routing"
              icon="route"
              label="Routing & IVR"
              strong
            />
            <DashboardActionLink
              detail="Users, extensions and availability"
              href="/telephony/users"
              icon="users"
              label="Agents"
            />
            <DashboardActionLink
              detail="Teams, members and ring strategies"
              href="/telephony/queues"
              icon="queue"
              label="Teams"
            />
            <DashboardActionLink
              detail="Phone numbers and caller ID"
              href="/telephony/numbers"
              icon="phone"
              label="Phone numbers"
            />
            <DashboardActionLink
              detail="Tracking pools and attribution numbers"
              href="/telephony/call-tracking/overview"
              icon="phone"
              label="Call tracking"
            />
          </div>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <DashboardRouteSummary
            activeQueueCount={activeQueueCount}
            latestLabel={
              latestQueueEntry
                ? latestContactName || latestQueueEntry.fromNumber || "Unknown caller"
                : "No callers waiting"
            }
            latestMeta={
              latestQueueEntry
                ? latestQueueEntry.opportunity?.title || "General call"
                : "Queue clear"
            }
            recentCalls={recentCalls.length}
            recordings={recordingCount}
            routeAgents={routeAgents.length}
          />
          <RecentCallLogTable calls={recentCalls.slice(0, 6)} />
        </div>
        <div className="space-y-5">
          <HealthPanel
            messagingWebhook={messagingWebhook}
            readinessChecks={readinessChecks}
            voiceWebhook={voiceWebhook}
          />
          <DashboardChromeInstallCard />
          <DashboardActionLink
            detail="Recordings, transcripts and summaries"
            href="/telephony/recordings"
            icon="record"
            label="Conversation pipeline"
            strong
          />
        </div>
      </div>
    </div>
  );
}

function DashboardCommandHeader({
  activeCallCount,
  activeQueueCount,
  averageAnswerSeconds,
  availableStaff,
  missedCallTasks,
  routeAgents,
  state,
  voiceReady,
}: {
  activeCallCount: number;
  activeQueueCount: number;
  averageAnswerSeconds: number;
  availableStaff: number;
  missedCallTasks: number;
  routeAgents: number;
  state: string;
  voiceReady: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] xl:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <span
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
              voiceReady
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            <PhoneIcon name={activeQueueCount ? "pulse" : "phone"} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Phone system
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {state}
              </h2>
              <LazyHelpTooltip content="Summarises whether the phone system is ready, how many calls are active or waiting, and where to go for monitoring or routing." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {routeAgents} routable agents, {activeQueueCount} waiting, {activeCallCount} active.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/telephony/live"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-semibold text-white shadow-theme-xs hover:bg-brand-600"
              >
                Monitoring
              </Link>
              <Link
                href="/telephony/routing"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/[0.05]"
              >
                Routing
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardHeaderMetric label="Waiting" value={activeQueueCount} />
          <DashboardHeaderMetric label="Active" value={activeCallCount} />
          <DashboardHeaderMetric label="Available" value={availableStaff} />
          <DashboardHeaderMetric label="Avg answer" value={`${averageAnswerSeconds}s`} />
        </div>
      </div>
      <div className="grid border-t border-gray-200 dark:border-gray-800 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardFooterMetric label="Routable" value={routeAgents} />
        <DashboardFooterMetric label="Ready agents" value={availableStaff} />
        <DashboardFooterMetric label="Follow-ups" value={missedCallTasks} />
        <DashboardFooterMetric label="Voice setup" value={voiceReady ? "Ready" : "Review"} />
      </div>
    </section>
  );
}

function DashboardHeaderMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function DashboardFooterMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">
        {value}
      </p>
    </div>
  );
}

function DashboardRouteSummary({
  activeQueueCount,
  latestLabel,
  latestMeta,
  recentCalls,
  recordings,
  routeAgents,
}: {
  activeQueueCount: number;
  latestLabel: string;
  latestMeta: string;
  recentCalls: number;
  recordings: number;
  routeAgents: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Queue summary
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                activeQueueCount
                  ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
                  : "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
              }`}
            >
              {activeQueueCount ? "Live pressure" : "Clear"}
            </span>
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <h3 className="truncate text-base font-semibold text-gray-800 dark:text-white/90">
              {activeQueueCount ? latestLabel : "No live queue pressure"}
            </h3>
            <LazyHelpTooltip content="Summarises the current live queue state so users can see whether callers are waiting and which route is under pressure." />
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
            {latestMeta}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
          <MiniDashboardMetric label="Waiting" value={activeQueueCount} />
          <MiniDashboardMetric label="Routable" value={routeAgents} />
          <MiniDashboardMetric label="Recent calls" value={recentCalls} />
          <MiniDashboardMetric label="Recordings" value={recordings} />
        </div>
      </div>
    </section>
  );
}

function DashboardAttentionPanel({
  items,
}: {
  items: DashboardAttentionItem[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Needs attention
        </p>
        <div className="mt-1 flex items-center gap-2">
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            What to look at first
          </h3>
          <LazyHelpTooltip content="Highlights the phone-system issues or queues that most need immediate action." />
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-800">
        {items.map((item) => (
          <DashboardAttentionRow key={item.label} {...item} />
        ))}
      </div>
    </section>
  );
}

function DashboardAttentionRow({
  count,
  detail,
  href,
  icon,
  label,
  tone,
}: {
  count: number;
  detail: string;
  href: string;
  icon: IconName;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
      : tone === "warning"
        ? "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        : tone === "danger"
          ? "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300"
          : "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 px-5 py-4 transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toneClass}`}>
        <PhoneIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
      <span className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-sm font-semibold text-gray-800 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900 dark:text-white/90">
        {count}
      </span>
      <span className="text-sm font-semibold text-gray-400 transition group-hover:text-brand-500">
        →
      </span>
    </Link>
  );
}

function MiniDashboardMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function DashboardActionLink({
  detail,
  href,
  icon,
  label,
  strong = false,
}: {
  detail: string;
  href: string;
  icon: IconName;
  label: string;
  strong?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-theme-xs transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 ${
        strong ? "min-h-[84px]" : ""
      }`}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900">
        <PhoneIcon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
          {detail}
        </span>
      </span>
      <span className="text-sm font-semibold text-gray-400 transition group-hover:text-brand-500">
        →
      </span>
    </Link>
  );
}

function DashboardChromeInstallCard() {
  return (
    <Link
      href="/settings/browser-extension"
      className="group block overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs transition hover:border-brand-200 hover:bg-brand-50/40 dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10"
    >
      <div className="flex items-start gap-4 p-5">
        <DesktopSoftphoneIcon className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Install desktop softphone
            </p>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
              macOS / Windows
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
            Download the floating softphone app for calls outside the CRM tab.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 dark:border-gray-800">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Detects the right app for the current computer
        </span>
        <span className="text-sm font-semibold text-brand-600 transition group-hover:text-brand-700 dark:text-brand-300">
          Install →
        </span>
      </div>
    </Link>
  );
}

function DesktopSoftphoneIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 48 48"
    >
      <rect x="4" y="7" width="40" height="30" rx="8" fill="#EEF4FF" />
      <path
        d="M16.7 18.1c.5-.5 1.3-.5 1.8 0l2.1 2.1c.5.5.5 1.3 0 1.8l-.8.8a10.5 10.5 0 0 0 5.4 5.4l.8-.8c.5-.5 1.3-.5 1.8 0l2.1 2.1c.5.5.5 1.3 0 1.8l-1.1 1.1c-.7.7-1.8 1-2.9.7-5.2-1.4-9.2-5.4-10.6-10.6-.3-1.1 0-2.2.7-2.9l.7-.7Z"
        fill="#465FFF"
      />
      <path
        d="M18 41h12"
        stroke="#98A2B3"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M13 13h22"
        stroke="#D6E2FF"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <circle
        cx="24"
        cy="24"
        r="22"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.08"
      />
    </svg>
  );
}

function BusinessNumbersTab({
  numbers,
  twilioReady,
}: {
  numbers: BusinessNumberRow[];
  twilioReady: boolean;
}) {
  return (
    <BusinessNumbersManager numbers={numbers} twilioReady={twilioReady} />
  );
}

function AgentsTab({
  queues,
  users,
}: {
  queues: ConfigQueue[];
  users: AgentManagerRow[];
}) {
  return (
    <AgentsManager
      queues={queues.map((queue) => ({
        id: queue.id,
        name: queue.name,
        enabled: queue.enabled,
      }))}
      users={users}
    />
  );
}

function RoutingIvrTab({
  activeQueueEntries,
  configRules,
  routingFlow,
  queues,
  routeAgents,
  users,
}: {
  activeQueueEntries: Array<QueueEntry>;
  configRules: ConfigRoutingRule[];
  routingFlow: ConfigRoutingFlow;
  queues: ConfigQueue[];
  routeAgents: { id: string; name: string }[];
  users: Array<VisibleUser>;
}) {
  const visibleAgents = users.slice(0, 6);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Routing & IVR
            </p>
            <StatusBadge>SmartFlow ready</StatusBadge>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              Main line call journey
            </h2>
            <LazyHelpTooltip content="Shows the routing and IVR workspace for how inbound callers move through the main line, teams and fallbacks." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            The routing flow is the working surface. Status and diagnostics sit below it.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[460px]">
          <RoutingStat label="Rules" value={configRules.length} />
          <RoutingStat label="Teams" value={queues.length} />
          <RoutingStat label="Routable" value={routeAgents.length} />
          <RoutingStat label="Waiting" value={activeQueueEntries.length} />
        </div>
      </div>

      <CallRoutingFlowBuilder
        queues={queues}
        routingFlow={routingFlow}
        rules={configRules}
        users={users.map((user) => ({ id: user.id, name: user.displayName }))}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <RoutingDiagnosticsPanel entries={activeQueueEntries} />
        <div className="space-y-5">
          <Panel title="Available agents" detail={`${routeAgents.length} can receive routed calls now.`}>
            <div className="space-y-3">
              {visibleAgents.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                >
                  <AgentIdentity user={user} compact />
                  <AvailabilityBadge status={user.voiceAvailability} />
                </div>
              ))}
              {visibleAgents.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No agents are configured yet.
                </p>
              )}
            </div>
          </Panel>
          <LiveInboundPanel
            activeQueueCount={activeQueueEntries.length}
            compact
            entries={activeQueueEntries}
            routeAgents={routeAgents}
          />
        </div>
      </div>
    </div>
  );
}

function CallGroupsTab({
  activeQueueCount,
  queues,
  users,
}: {
  activeQueueCount: number;
  queues: ConfigQueue[];
  users: Array<VisibleUser>;
}) {
  return (
    <Panel
      title="Teams"
      detail={`${queues.length} teams, ${users.length} agents and ${activeQueueCount} waiting calls.`}
    >
      <QueueSettingsForm agents={users} queues={queues} />
    </Panel>
  );
}

function MonitoringTab({
  activeQueueCount,
  activeQueueEntries,
  callLogDirection,
  callLogPage,
  callLogQuery,
  callLogStatus,
  routeAgents,
  users,
  view,
}: {
  activeQueueCount: number;
  activeQueueEntries: Array<QueueEntry>;
  callLogDirection: CallDirectionFilter;
  callLogPage: Awaited<ReturnType<typeof loadCallLogPage>> | null;
  callLogQuery: string;
  callLogStatus: CallStatusFilter;
  routeAgents: { id: string; name: string }[];
  users: Array<VisibleUser>;
  view: MonitoringView;
}) {
  const recordedCount = callLogPage
    ? callLogPage.calls.filter((call) => call.recordingSid).length
    : "Open logs";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Monitoring
          </p>
          <div className="mt-2 flex items-center gap-2">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
              Live routing and call history
            </h2>
            <LazyHelpTooltip content="Switch between live queue monitoring and the searchable call log without leaving the phone-system workspace." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Use Live while calls are waiting. Use Call log to find previous conversations, recordings and transcripts.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
          <RoutingStat label="Waiting" value={activeQueueCount} />
          <RoutingStat label="Routable" value={routeAgents.length} />
          <RoutingStat label="Logged calls" value={callLogPage?.totalCount ?? "Open logs"} />
          <RoutingStat label="Recorded" value={recordedCount} />
        </div>
      </div>

      <MonitoringViewSwitch activeView={view} />

      {view === "live" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <LiveInboundPanel
            activeQueueCount={activeQueueCount}
            entries={activeQueueEntries}
            routeAgents={routeAgents}
          />
          <MonitoringSideRail users={users} />
        </div>
      ) : callLogPage ? (
        <CallLogWorkspace
          activeQueueCount={activeQueueCount}
          initialData={callLogPage}
          initialFilters={{
            direction: callLogDirection,
            query: callLogQuery,
            status: callLogStatus,
          }}
          routeAgentsCount={routeAgents.length}
        />
      ) : (
        <Panel
          title="Call log"
          detail="The call-log dataset is loaded only when the log view is opened."
        >
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Switch to the Call log view to search historic calls, recordings and transcripts.
          </p>
        </Panel>
      )}
    </div>
  );
}

function MonitoringViewSwitch({ activeView }: { activeView: MonitoringView }) {
  const items: Array<{ href: string; label: string; value: MonitoringView }> = [
    { href: "/telephony/live", label: "Live", value: "live" },
    { href: "/telephony/live?view=logs", label: "Call log", value: "logs" },
  ];

  return (
    <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      {items.map((item) => {
        const active = item.value === activeView;

        return (
          <Link
            key={item.value}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 min-w-[110px] items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${
              active
                ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function MonitoringSideRail({ users }: { users: Array<VisibleUser> }) {
  return (
    <div className="space-y-5">
      <Panel title="Available agents" detail="Manual routing should only offer routable agents.">
        <div className="space-y-3">
          {users.slice(0, 8).map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
            >
              <AgentIdentity user={user} compact />
              <AvailabilityBadge status={user.voiceAvailability} />
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Supervisor controls" detail="Commercial controls with permission checks before activation.">
        <div className="grid gap-3">
          <ConfigChip label="Listen" value="Available on connected calls" />
          <ConfigChip label="Whisper" value="Requires active agent call" />
          <ConfigChip label="Barge" value="Confirmation required" />
          <ConfigChip label="Manual route" value="Available for waiting calls" />
        </div>
      </Panel>
    </div>
  );
}

function BusinessHoursTab({
  afterHours,
  holidays,
  queues,
  timezone,
  weekly,
}: {
  afterHours: BusinessAfterHours;
  holidays: BusinessHoliday[];
  queues: ConfigQueue[];
  timezone: string;
  weekly: BusinessDay[];
}) {
  const status = businessHoursStatus({ holidays, timezone, weekly });
  const afterHoursRoute = formatAfterHoursRoute(afterHours, queues);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Business hours
            </p>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                status.open
                  ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                  : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  status.open ? "bg-success-500" : "bg-warning-500"
                }`}
              />
              {status.label}
            </span>
          </div>
          <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-white/90">
            Business hours routing control
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Calls use Routing SmartFlow when open. When closed, holiday rules and
            after-hours handling take over before the caller reaches a team.
          </p>
        </div>
        <Link
          href="/telephony/routing"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Edit routing
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <BusinessHoursSummaryCard
          detail={status.detail}
          icon="clock"
          label={status.open ? "Currently open" : "Currently closed"}
          tone={status.open ? "success" : "warning"}
          value={status.label}
        />
        <BusinessHoursSummaryCard
          detail={timezone}
          icon="clock"
          label="Active schedule"
          tone="brand"
          value={weeklySummary(weekly)}
        />
        <BusinessHoursSummaryCard
          detail={afterHoursRoute.detail}
          icon="route"
          label="After-hours route"
          tone="purple"
          value={afterHoursRoute.title}
        />
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <BusinessHoursSettingsForm
          afterHours={afterHours}
          holidays={holidays}
          queues={queues}
          timezone={timezone}
          weekly={weekly}
        />
        <div className="min-w-0 space-y-5">
          <RoutingImpactPanel afterHoursRoute={afterHoursRoute.title} />
          <Panel
            title="Holiday closures"
            detail={`${holidays.length} closure${holidays.length === 1 ? "" : "s"} scheduled.`}
          >
            <div className="space-y-3">
              {holidays.slice(0, 5).map((holiday) => (
                <div
                  key={`${holiday.date}-${holiday.name}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                      {holiday.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {holiday.date}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                    Closed
                  </span>
                </div>
              ))}
              {holidays.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  No holiday closures scheduled.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function weeklySummary(weekly: BusinessDay[]) {
  const openDays = weekly.filter((day) => day.open);

  if (openDays.length === 0) return "Closed all week";

  const groups = openDays.reduce<BusinessDay[][]>((result, day) => {
    const current = result.at(-1);
    const previous = current?.at(-1);

    if (
      current &&
      previous &&
      day.day === previous.day + 1 &&
      day.start === previous.start &&
      day.end === previous.end
    ) {
      current.push(day);
      return result;
    }

    result.push([day]);
    return result;
  }, []);

  const parts = groups.map((group) => {
    const first = group[0];
    const last = group.at(-1) ?? first;
    const label =
      first.day === last.day
        ? first.label.slice(0, 3)
        : `${first.label.slice(0, 3)}-${last.label.slice(0, 3)}`;

    return `${label} ${first.start}-${first.end}`;
  });

  return parts.length > 2 ? `${parts.slice(0, 2).join(", ")} +${parts.length - 2}` : parts.join(", ");
}

function BusinessHoursSummaryCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: IconName;
  label: string;
  tone: "brand" | "purple" | "success" | "warning";
  value: string;
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300",
    purple: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300",
    success: "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300",
    warning: "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300",
  }[tone];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <PhoneIcon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-1 truncate text-base font-semibold text-gray-800 dark:text-white/90">
            {value}
          </p>
          <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function RoutingImpactPanel({ afterHoursRoute }: { afterHoursRoute: string }) {
  return (
    <Panel title="Routing impact" detail="How business hours affect call routing.">
      <div className="space-y-3">
        <RoutingImpactStep icon="phone" label="Inbound call" tone="brand" />
        <RoutingImpactConnector />
        <RoutingImpactStep icon="clock" label="Business hours check" tone="warning" />
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-2">
            <span className="inline-flex rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success-700 dark:bg-success-900/20 dark:text-success-300">
              Open
            </span>
            <RoutingImpactStep icon="route" label="Routing SmartFlow" tone="success" compact />
          </div>
          <div className="space-y-2">
            <span className="inline-flex rounded-full bg-warning-50 px-2 py-0.5 text-xs font-semibold text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
              Closed
            </span>
            <RoutingImpactStep icon="queue" label={afterHoursRoute} tone="purple" compact />
          </div>
        </div>
        <Link
          href="/telephony/routing"
          className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]"
        >
          Edit routing
        </Link>
      </div>
    </Panel>
  );
}

function RoutingImpactStep({
  compact = false,
  icon,
  label,
  tone,
}: {
  compact?: boolean;
  icon: IconName;
  label: string;
  tone: "brand" | "purple" | "success" | "warning";
}) {
  const toneClass = {
    brand: "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900/40 dark:bg-brand-900/20 dark:text-brand-300",
    purple: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-300",
    success: "border-success-200 bg-success-50 text-success-700 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300",
    warning: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-900/40 dark:bg-warning-900/20 dark:text-warning-300",
  }[tone];

  return (
    <div
      className={`flex items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${toneClass} ${
        compact ? "min-h-[74px] flex-col py-3 text-center" : "h-12"
      }`}
    >
      <PhoneIcon name={icon} className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}

function RoutingImpactConnector() {
  return (
    <div className="flex justify-center">
      <span className="h-6 w-px bg-gray-200 dark:bg-gray-800" />
    </div>
  );
}

function formatAfterHoursRoute(afterHours: BusinessAfterHours, queues: ConfigQueue[]) {
  if (afterHours.destination === "QUEUE") {
    const queue = queues.find((item) => item.id === afterHours.queueId);

    return {
      title: queue?.name ?? "Fallback team",
      detail: "Closed calls go to another team.",
    };
  }

  if (afterHours.destination === "VOICEMAIL") {
    return {
      title: "Voicemail",
      detail: afterHours.createTask ? "Records voicemail and creates a task." : "Records voicemail.",
    };
  }

  if (afterHours.destination === "HANGUP") {
    return {
      title: "Message and hang up",
      detail: "Plays the closed message, then ends the call.",
    };
  }

  return {
    title: "Missed-call task",
    detail: afterHours.notificationEmail
      ? `Creates a task and emails ${afterHours.notificationEmail}.`
      : "Creates a missed-call task for follow-up.",
  };
}

function businessHoursStatus({
  holidays,
  timezone,
  weekly,
}: {
  holidays: BusinessHoliday[];
  timezone: string;
  weekly: BusinessDay[];
}) {
  const now = new Date();
  const local = localDateTimeParts(now, timezone);
  const holiday = holidays.find((item) => item.date === local.date);

  if (holiday) {
    return {
      detail: holiday.name,
      label: "Closed for holiday",
      open: false,
    };
  }

  const today = weekly.find((day) => day.day === local.weekdayIndex);

  if (!today?.open) {
    return {
      detail: "After-hours route is active.",
      label: "Closed now",
      open: false,
    };
  }

  if (local.time >= today.start && local.time < today.end) {
    return {
      detail: `Closes at ${today.end}`,
      label: "Open now",
      open: true,
    };
  }

  return {
    detail: local.time < today.start ? `Opens at ${today.start}` : "After-hours route is active.",
    label: "Closed now",
    open: false,
  };
}

function localDateTimeParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: validTimezone(timezone),
    weekday: "long",
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    weekdayIndex: weekdayIndex(`${parts.year}-${parts.month}-${parts.day}`),
  };
}

function validTimezone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: timezone || "Europe/London" });
    return timezone || "Europe/London";
  } catch {
    return "Europe/London";
  }
}

function weekdayIndex(localDate: string) {
  const day = new Date(`${localDate}T00:00:00Z`).getUTCDay();

  return (day + 6) % 7;
}

function RecordingsTab({
  baseUrl,
  initialFilter,
  initialQuery,
  recordingPage,
  recordingSettings,
  voiceIntelligenceServiceSid,
}: {
  baseUrl: string;
  initialFilter: RecordingFilter;
  initialQuery: string;
  recordingPage: RecordingPage;
  recordingSettings: RecordingSettings;
  voiceIntelligenceServiceSid: string;
}) {
  return (
    <div className="space-y-5">
      <RecordingsWorkspace
        initialData={recordingPage}
        initialFilter={initialFilter}
        initialQuery={initialQuery}
      />

      <Panel
        title="Recording settings"
        detail="Replay, transcript and AI capture controls."
      >
        <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          <RecordingReadinessRow
            label="Recording"
            ready={recordingSettings.enabled}
            value={recordingSettings.enabled ? "Enabled" : "Disabled"}
          />
          <RecordingReadinessRow
            label="Transcripts"
            ready={recordingSettings.transcriptEnabled}
            value={recordingSettings.transcriptEnabled ? "Enabled" : "Disabled"}
          />
          <RecordingReadinessRow
            label="AI analysis"
            ready={recordingSettings.aiAnalysisEnabled}
            value={recordingSettings.aiAnalysisEnabled ? "Enabled" : "Disabled"}
          />
          <RecordingReadinessRow
            label="Voice Intelligence"
            ready={Boolean(voiceIntelligenceServiceSid)}
            value={voiceIntelligenceServiceSid ? "Configured" : "Service SID needed"}
          />
          <RecordingReadinessRow
            label="Retention"
            ready
            value={`${recordingSettings.retentionDays} days`}
          />
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <CallRecordingSettingsForm settings={recordingSettings} />
          <div>
            <WebhookCode
              label="Transcript webhook"
              value={`${baseUrl || "https://crm.example.com"}/api/webhooks/twilio/voice/transcript`}
            />
            {recordingSettings.enabled && (
              <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
                Keep the recorded notice accurate for consent and retention.
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function RecordingReadinessRow({
  label,
  ready,
  value,
}: {
  label: string;
  ready: boolean;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          ready
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${ready ? "bg-success-500" : "bg-warning-500"}`} />
        {value}
      </span>
    </div>
  );
}

function SettingsTab({
  canEdit,
  hasEncryptionKey,
  hasStoredCredentials,
  messagingWebhook,
  numberPurchaseReady,
  phoneConfigUpdatedAt,
  readinessChecks,
  smsCapableNumberCount,
  twilioConfig,
  voiceWebhook,
}: {
  canEdit: boolean;
  hasEncryptionKey: boolean;
  hasStoredCredentials: boolean;
  messagingWebhook: string;
  numberPurchaseReady: boolean;
  phoneConfigUpdatedAt: string | null;
  readinessChecks: Array<{ detail: string; label: string; ready: boolean }>;
  smsCapableNumberCount: number;
  twilioConfig: TwilioConfig | null;
  voiceWebhook: string;
}) {
  const readyCount = readinessChecks.filter((check) => check.ready).length;

  return (
    <div className="space-y-5">
      <SettingsReadinessStrip
        readinessChecks={readinessChecks}
        readyCount={readyCount}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="space-y-5">
          <Panel title="Setup and repair" detail="Run provider setup tasks without editing raw Twilio fields.">
            <TwilioSettingsForm
              config={twilioConfig ?? {}}
              hasStoredCredentials={hasStoredCredentials}
              hasEncryptionKey={hasEncryptionKey}
              canEdit={canEdit}
              mode="operations"
            />
          </Panel>

          <SmsCapableNumbersPanel
            numberPurchaseReady={numberPurchaseReady}
            smsCapableNumberCount={smsCapableNumberCount}
          />

          <details className="group rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <span>
                <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Advanced
                </span>
                <span className="mt-1 block text-base font-semibold text-gray-800 dark:text-white/90">
                  Provider credentials and service IDs
                </span>
              </span>
              <span className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 group-open:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:group-open:bg-white/[0.04]">
                Open
              </span>
            </summary>
            <div className="border-t border-gray-200 p-5 dark:border-gray-800">
              <TwilioSettingsForm
                config={twilioConfig ?? {}}
                hasStoredCredentials={hasStoredCredentials}
                hasEncryptionKey={hasEncryptionKey}
                canEdit={canEdit}
                mode="advanced"
              />
            </div>
          </details>
        </div>
        <div className="space-y-5">
          <SettingsWebhookPanel
            messagingWebhook={messagingWebhook}
            twilioConfig={twilioConfig}
            voiceWebhook={voiceWebhook}
          />
          <SettingsSystemStatePanel
            hasStoredCredentials={hasStoredCredentials}
            phoneConfigUpdatedAt={phoneConfigUpdatedAt}
            twilioConfig={twilioConfig}
          />
        </div>
      </div>
    </div>
  );
}

function SettingsReadinessStrip({
  readinessChecks,
  readyCount,
}: {
  readinessChecks: Array<{ detail: string; label: string; ready: boolean }>;
  readyCount: number;
}) {
  const complete = readyCount === readinessChecks.length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-[220px] items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              complete
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            <PhoneIcon name={complete ? "pulse" : "alert"} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Phone setup readiness
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {readyCount}/{readinessChecks.length} core checks complete
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          {readinessChecks.map((check) => (
            <ReadinessPill key={check.label} check={check} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReadinessPill({
  check,
}: {
  check: { detail: string; label: string; ready: boolean };
}) {
  return (
    <div
      title={check.ready ? "Ready" : check.detail}
      className={`flex min-h-8 min-w-[132px] items-center gap-2 rounded-lg border px-3 py-1.5 ${
        check.ready
          ? "border-success-100 bg-success-50/70 dark:border-success-900/40 dark:bg-success-900/10"
          : "border-warning-100 bg-warning-50/80 dark:border-warning-900/40 dark:bg-warning-900/10"
      }`}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${
          check.ready ? "bg-success-500" : "bg-warning-500"
        }`}
      />
      <p className="min-w-0 truncate text-xs font-semibold text-gray-800 dark:text-white/90">
        {check.label}
      </p>
    </div>
  );
}

function SettingsWebhookPanel({
  messagingWebhook,
  twilioConfig,
  voiceWebhook,
}: {
  messagingWebhook: string;
  twilioConfig: TwilioConfig | null;
  voiceWebhook: string;
}) {
  const transcriptWebhook = `${
    twilioConfig?.webhookBaseUrl?.replace(/\/$/, "") || "https://crm.example.com"
  }/api/webhooks/twilio/voice/transcript`;

  return (
    <Panel title="Webhooks" detail="Provider callbacks that should point at this CRM.">
      <div className="space-y-3">
        <WebhookCode label="Voice" value={voiceWebhook} />
        <WebhookCode label="Messaging" value={messagingWebhook} />
        <WebhookCode label="Transcript" value={transcriptWebhook} />
      </div>
    </Panel>
  );
}

function SmsCapableNumbersPanel({
  numberPurchaseReady,
  smsCapableNumberCount,
}: {
  numberPurchaseReady: boolean;
  smsCapableNumberCount: number;
}) {
  return (
    <Panel
      title="Phone number setup"
      detail="Buy Twilio numbers for business calls, SMS and call tracking."
      badge={`${smsCapableNumberCount} active`}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
            <PhoneIcon name="phone" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              Add the right type of number for the job.
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Business numbers are searched as Voice + SMS capable. Call tracking numbers stay in the call-tracking setup area.
            </p>
            {!numberPurchaseReady ? (
              <p className="mt-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs font-semibold text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-200">
                Save Twilio Account SID, Auth Token and webhook base URL before buying numbers.
              </p>
            ) : null}
          </div>
        </div>
        <Link
          href="/telephony/numbers"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white shadow-theme-xs transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          Add phone number
        </Link>
      </div>
    </Panel>
  );
}

function SettingsSystemStatePanel({
  hasStoredCredentials,
  phoneConfigUpdatedAt,
  twilioConfig,
}: {
  hasStoredCredentials: boolean;
  phoneConfigUpdatedAt: string | null;
  twilioConfig: TwilioConfig | null;
}) {
  return (
    <Panel title="System state" detail="CRM-side behaviour, not Twilio credentials.">
      <div className="space-y-3">
        <ConfigChip
          label="Credentials"
          value={hasStoredCredentials ? "Stored securely" : "Not connected"}
        />
        <ConfigChip
          label="Voice service"
          value={twilioConfig?.twimlAppSid ? "Configured" : "Needs setup"}
        />
        <ConfigChip
          label="Messaging"
          value={twilioConfig?.messagingServiceSid ? "Configured" : "Needs setup"}
        />
        <ConfigChip label="Last saved" value={formatConfigSavedAt(phoneConfigUpdatedAt)} />
      </div>
    </Panel>
  );
}

function LiveInboundPanel({
  activeQueueCount,
  compact = false,
  entries,
  routeAgents,
}: {
  activeQueueCount: number;
  compact?: boolean;
  entries: Array<QueueEntry>;
  routeAgents: { id: string; name: string }[];
}) {
  return (
    <Panel
      title="Live inbound routing"
      detail="Track who Twilio is trying and manually route waiting calls."
      badge={`${activeQueueCount} LIVE`}
    >
      {entries.length ? (
        <div className="space-y-3">
          {entries.map((entry) => {
            const contactName = [entry.contact?.firstName, entry.contact?.lastName]
              .filter(Boolean)
              .join(" ");
            const attempts = routingAttempts(entry.metadata);
            const transitions = routingTransitions(entry.metadata);
            const metadata = recordMetadata(entry.metadata);
            const canRoute = entry.status !== "ANSWERED";
            const routeName =
              stringMetadata(metadata, "queueName") ||
              stringMetadata(metadata, "routingRuleName") ||
              "Default route";
            const routingSource = stringMetadata(metadata, "routingSource") ?? "routing-rules";
            const currentNode =
              stringMetadata(metadata, "routingCurrentNodeLabel") ||
              stringMetadata(metadata, "routingFlowNodeLabel") ||
              "Not recorded";
            const journey = routingJourney(transitions);
            const attemptsCount = attempts.length;

            return (
              <div
                key={entry.id}
                className={`grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03] ${
                  compact ? "" : "xl:grid-cols-[minmax(0,1fr)_280px]"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
                          {contactName || entry.fromNumber || "Unknown caller"}
                        </h3>
                        <StatusBadge>{entry.status}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {entry.opportunity?.title || "General call"} / {entry.fromNumber || "Unknown number"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <LiveCallPill label="Wait" value={<LiveQueueTimer queuedAt={entry.queuedAt.toISOString()} />} />
                      <LiveCallPill label="Attempts" value={attemptsCount} />
                      <LiveCallPill label="Route" value={routeName} />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-gray-600 dark:text-gray-300 md:grid-cols-3">
                    <p>
                      <span className="text-gray-400">Queued: </span>
                      {formatDate(entry.queuedAt)}
                    </p>
                    <p>
                      <span className="text-gray-400">Trying: </span>
                      {entry.assignedUser?.name ?? "No agent yet"}
                    </p>
                    <p>
                      <span className="text-gray-400">Route: </span>
                      {routeName}
                    </p>
                    <p>
                      <span className="text-gray-400">Source: </span>
                      {formatSystemValue(routingSource)}
                    </p>
                    <p>
                      <span className="text-gray-400">Node: </span>
                      {currentNode}
                    </p>
                  </div>
                  {journey.length ? (
                    <p className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                      {journey.join(" -> ")}
                    </p>
                  ) : null}
                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                      Attempts
                    </p>
                    {attempts.length ? (
                      <div className="space-y-2">
                        {attempts.map((attempt) => (
                          <div
                            key={attempt.id}
                            className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="font-medium text-gray-800 dark:text-white/90">
                              {attempt.agentName}
                            </span>
                            <span>
                              {attempt.mode} / {attempt.status} /{" "}
                              {formatDate(new Date(attempt.startedAt))}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No agents tried yet.
                      </p>
                    )}
                  </div>
                  <RoutingTransitionList transitions={transitions} />
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                    Manual route
                  </p>
                  <CallRouteForm
                    queueEntryId={entry.id}
                    agents={routeAgents.filter((agent) => agent.id !== entry.assignedUserId)}
                    disabled={!canRoute}
                  />
                  <QueueCallAdminActions queueEntryId={entry.id} canAct={canRoute} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm font-medium text-gray-800 dark:text-white/90">
            No live inbound calls
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Calls will appear here as Twilio starts routing them.
          </p>
        </div>
      )}
    </Panel>
  );
}

function RoutingDiagnosticsPanel({ entries }: { entries: Array<QueueEntry> }) {
  const latestEntries = entries.slice(0, 5);

  return (
    <Panel
      title="Routing diagnostics"
      detail="Why the live queue selected its route, node and latest action."
    >
      {latestEntries.length ? (
        <div className="space-y-3">
          {latestEntries.map((entry) => {
            const metadata = recordMetadata(entry.metadata);
            const transitions = routingTransitions(entry.metadata);
            const latest = transitions.at(-1);
            const routeName =
              stringMetadata(metadata, "queueName") ||
              stringMetadata(metadata, "routingRuleName") ||
              "Default route";
            const source = stringMetadata(metadata, "routingSource") ?? "routing-rules";
            const node =
              stringMetadata(metadata, "routingCurrentNodeLabel") ||
              stringMetadata(metadata, "routingFlowNodeLabel") ||
              "Not recorded";
            const journey = routingJourney(transitions);

            return (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                      {routeName}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatSystemValue(source)} / {node}
                    </p>
                  </div>
                  <StatusBadge>{entry.status}</StatusBadge>
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
                  {latest
                    ? `${formatSystemValue(latest.event)}: ${latest.detail ?? latest.reason ?? "No detail"}`
                    : "No routing transitions recorded yet."}
                </p>
                {journey.length ? (
                  <p className="mt-2 text-xs font-medium leading-5 text-gray-700 dark:text-gray-200">
                    {journey.join(" -> ")}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Diagnostics will appear when an inbound call enters the queue.
        </p>
      )}
    </Panel>
  );
}

function RoutingTransitionList({
  transitions,
}: {
  transitions: ReturnType<typeof routingTransitions>;
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        Routing trail
      </p>
      {transitions.length ? (
        <div className="space-y-2">
          {transitions.slice(-8).map((transition) => (
            <div
              key={transition.id}
              className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/[0.04] dark:text-gray-300"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-gray-800 dark:text-white/90">
                  {formatSystemValue(transition.event)}
                </span>
                <span>{formatDate(new Date(transition.at))}</span>
              </div>
              <p className="mt-1 leading-5">
                {[transition.nodeLabel, transition.queueName, transition.detail ?? transition.reason]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No routing transitions recorded yet.
        </p>
      )}
    </div>
  );
}

function routingJourney(transitions: ReturnType<typeof routingTransitions>) {
  const steps = transitions
    .map((transition) => {
      if (transition.event === "inbound_route_resolved") return "Inbound";
      if (transition.event === "flow_queue") return transition.nodeLabel ?? "Ring team";
      if (transition.event === "flow_wait") return transition.nodeLabel ?? "Wait";
      if (transition.event === "flow_message") return transition.nodeLabel ?? "Message";
      if (transition.event === "flow_ivr") return transition.nodeLabel ?? "IVR";
      if (transition.event === "flow_redirect") return transition.nodeLabel ?? "Redirect";
      if (transition.event === "agent_invited") {
        return transition.detail?.includes("agent") ? "Agent ringing" : "Ringing";
      }
      if (transition.event === "agent_no_answer") return "No answer";
      if (transition.event === "flow_voicemail" || transition.event === "fallback_voicemail") {
        return "Voicemail";
      }
      if (transition.event === "flow_end") return "End call";
      if (transition.event === "fallback_missed_task") return "Missed task";
      if (transition.event === "queue_error") return "Queue error";
      return null;
    })
    .filter((step): step is string => Boolean(step));

  return steps.filter((step, index) => step !== steps[index - 1]).slice(-7);
}

function HealthPanel({
  messagingWebhook,
  readinessChecks,
  voiceWebhook,
}: {
  messagingWebhook: string;
  readinessChecks: Array<{ detail: string; label: string; ready: boolean }>;
  voiceWebhook: string;
}) {
  return (
    <Panel title="System health" detail="Core voice, messaging and browser softphone dependencies.">
      <div className="space-y-3">
        {readinessChecks.map((check) => (
          <SetupRow
            key={check.label}
            detail={check.detail}
            label={check.label}
            ready={check.ready}
          />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <WebhookCode label="Voice webhook" value={voiceWebhook} />
        <WebhookCode label="Messaging webhook" value={messagingWebhook} />
      </div>
    </Panel>
  );
}

function LiveCallPill({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-[10px] font-semibold uppercase text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <div className="mt-1 truncate text-xs font-semibold text-gray-800 dark:text-white/90">
        {value}
      </div>
    </div>
  );
}

function RecentCallLogTable({ calls }: { calls: Array<RecentCall> }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Call log
          </p>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Recent calls
            </h3>
            <LazyHelpTooltip content="Lists the latest recorded phone calls with status, timing and linked customer context." />
          </div>
        </div>
        <Link
          href="/telephony/live?view=logs"
          className="text-sm font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300"
        >
          View all →
        </Link>
      </div>
      <div className="overflow-x-auto">
        {calls.length ? (
          <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.03]">
              <tr>
                <th className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Contact
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Direction
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Time
                </th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Duration
                </th>
                <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {calls.map((call) => {
                const contactName = [call.contact?.firstName, call.contact?.lastName]
                  .filter(Boolean)
                  .join(" ");
                const label =
                  contactName ||
                  call.opportunity?.title ||
                  call.fromNumber ||
                  call.toNumber ||
                  "Unknown caller";

                return (
                  <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <td className="max-w-[260px] px-5 py-3">
                      <p className="truncate font-semibold text-gray-800 dark:text-white/90">
                        {label}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                        {call.opportunity?.title || call.user?.name || "General call"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {formatSystemValue(call.direction)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(call.startedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {formatDuration(call.durationSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <StatusBadge>{formatSystemValue(call.status)}</StatusBadge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">
            No calls have been logged yet.
          </p>
        )}
      </div>
    </section>
  );
}

function Panel({
  badge,
  children,
  detail,
  title,
}: {
  badge?: string;
  children: React.ReactNode;
  detail?: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                {title}
              </h2>
              {detail && <LazyHelpTooltip content={detail} />}
            </div>
            {detail && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{detail}</p>
            )}
          </div>
          {badge && <StatusBadge>{badge}</StatusBadge>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TelephonyStatusStrip({
  activeCallCount,
  activeQueueCount,
  averageAnswerSeconds,
  readinessChecks,
  readyCount,
  routableStaff,
  systemStatus,
  voiceReady,
}: {
  activeCallCount: number;
  activeQueueCount: number;
  averageAnswerSeconds: number;
  readinessChecks: Array<{ detail: string; label: string; ready: boolean }>;
  readyCount: number;
  routableStaff: number;
  systemStatus: string;
  voiceReady: boolean;
}) {
  const setupIssues = readinessChecks.filter((check) => !check.ready);
  const showSetupSummary = !voiceReady && setupIssues.length > 0;
  const setupSummaryTitle =
    setupIssues.length === 0
      ? "Setup ready"
      : voiceReady
        ? "Optional setup"
        : "Setup required";
  const setupSummaryDetail =
    setupIssues.length === 0
      ? "All checks complete"
      : setupIssues.map((check) => check.label).join(", ");

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2.5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-w-[220px] items-center gap-3 xl:w-[270px]">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              voiceReady
                ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
                : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
            }`}
          >
            <PhoneIcon name={voiceReady ? "pulse" : "alert"} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {systemStatus}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {voiceReady ? "Core voice setup ready" : `${readyCount}/5 setup checks complete`}
            </p>
          </div>
        </div>

        <div
          className={`grid grid-cols-2 gap-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] sm:grid-cols-4 xl:w-[460px] ${
            showSetupSummary ? "" : "xl:ml-auto"
          }`}
        >
          <CompactStatusItem label="Routable" value={routableStaff} />
          <CompactStatusItem label="Waiting" value={activeQueueCount} />
          <CompactStatusItem label="Active" value={activeCallCount} />
          <CompactStatusItem label="Avg answer" value={`${averageAnswerSeconds}s`} />
        </div>

        {showSetupSummary && (
          <Link
            href="/telephony/system"
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-warning-200 bg-warning-50 px-3 py-1.5 transition hover:bg-warning-100 dark:border-warning-900/40 dark:bg-warning-900/20 dark:hover:bg-warning-900/30 xl:ml-auto xl:w-[260px]"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-gray-800 dark:text-white/90">
                {setupSummaryTitle}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">
                {setupSummaryDetail}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-800 dark:bg-warning-900/30 dark:text-warning-200">
              {readyCount}/{readinessChecks.length}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}

function CompactStatusItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 border-r border-gray-200 px-3 py-1.5 last:border-r-0 dark:border-gray-800">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function RoutingStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function AgentIdentity({
  compact = false,
  user,
}: {
  compact?: boolean;
  user: VisibleUser;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="relative inline-flex h-10 w-10 shrink-0">
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-gray-900 bg-cover bg-center text-xs font-semibold text-white dark:bg-white dark:text-gray-900"
          style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}
        >
          {user.avatarUrl ? (
            <span className="sr-only">{user.displayName}</span>
          ) : (
            agentInitials(user.displayName)
          )}
        </span>
        <span
          className={`absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-white dark:border-gray-900 ${
            availabilityDotClass(user.voiceAvailability)
          }`}
        />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
          {user.displayName}
        </p>
        {!compact && (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            {user.email}
          </p>
        )}
      </div>
    </div>
  );
}

function AvailabilityBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${availabilityBadgeClass(status)}`}
    >
      <span className={`h-2 w-2 rounded-full ${availabilityDotClass(status)}`} />
      {status.replaceAll("_", " ")}
    </span>
  );
}

function SetupRow({
  detail,
  label,
  ready,
}: {
  detail?: string;
  label: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </span>
        {detail && (
          <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
            {detail}
          </span>
        )}
      </span>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          ready
            ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300"
            : "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
        }`}
      >
        {ready ? "Ready" : "Needed"}
      </span>
    </div>
  );
}

function ConfigChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-400 dark:text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-gray-800 dark:text-white/90">{value}</p>
    </div>
  );
}

function WebhookCode({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <code className="mt-1 block break-all rounded-lg bg-gray-950 p-2 text-xs text-gray-100">
        {value}
      </code>
    </div>
  );
}

function availabilityBadgeClass(status: string) {
  if (status === "AVAILABLE") {
    return "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-300";
  }
  if (status === "BUSY") {
    return "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-300";
  }
  if (status === "AWAY") {
    return "bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300";
  }
  return "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300";
}

function availabilityDotClass(status: string) {
  if (status === "AVAILABLE") return "bg-success-500";
  if (status === "BUSY") return "bg-error-500";
  if (status === "AWAY") return "bg-warning-500";
  return "bg-gray-400";
}

function formatSystemValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function formatConfigSavedAt(value: string | null) {
  return value ? formatDate(new Date(value)) : "Not saved yet";
}

function businessNumberCapabilities(value: unknown): BusinessNumberRow["capabilities"] {
  const capabilities = recordMetadata(value);

  return {
    voice: Boolean(capabilities.voice),
    sms: Boolean(capabilities.sms),
    mms: Boolean(capabilities.mms),
  };
}

function businessNumberRouting({
  number,
  routingFlow,
  status,
  voiceCallerId,
}: {
  number: string;
  routingFlow: ConfigRoutingFlow;
  status: string;
  voiceCallerId: string | null;
}): { status: BusinessNumberRow["routingStatus"]; label: string } {
  if (status === "RELEASED") {
    return { status: "RELEASED", label: "Released numbers no longer route calls." };
  }

  const normalizedNumber = normalizeCallableNumber(number);
  const normalizedCallerId = voiceCallerId ? normalizeCallableNumber(voiceCallerId) : null;

  if (
    routingFlow.nodes.some((node) => {
      const data = recordMetadata(node.data);
      const candidates = [
        data.inboundNumber,
        data.phoneNumber,
        data.businessNumber,
        data.businessPhoneNumber,
        data.toNumber,
      ];

      return candidates.some(
        (candidate) =>
          typeof candidate === "string" &&
          normalizeCallableNumber(candidate) === normalizedNumber,
      );
    })
  ) {
    return { status: "CONFIGURED", label: "Routing flow references this inbound number." };
  }

  if (normalizedCallerId && normalizedCallerId === normalizedNumber) {
    return { status: "DEFAULT", label: "Uses the current default inbound route." };
  }

  return {
    status: "NEEDS_ROUTING",
    label: "Add an inbound-number start point in Routing before publishing.",
  };
}

function recordMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

type IconName =
  | "alert"
  | PhoneTabIconName
  | "extension";

function PhoneIcon({ className, name }: { className: string; name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    alert: <path d="M12 9v4m0 4h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />,
    clock: <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    extension: <path d="M8 3h8v4h3a2 2 0 0 1 2 2v4h-4v2a3 3 0 1 1-6 0v-2H7v8H3V7a4 4 0 0 1 4-4h1Zm0 4H7v2h6V7H8Z" />,
    phone: <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1.5 1.5 0 0 1 1.5-.4c1.6.5 3.2.8 4.9.8a1.5 1.5 0 0 1 1.5 1.5v3.5a1.5 1.5 0 0 1-1.5 1.5A20.5 20.5 0 0 1 1.9 1.6 1.5 1.5 0 0 1 3.4.1h3.5a1.5 1.5 0 0 1 1.5 1.5c0 1.7.3 3.3.8 4.9.2.5 0 1.1-.4 1.5l-2.2 2.8Z" />,
    pulse: <path d="M3 12h4l2-7 4 14 2-7h6" />,
    queue: <path d="M4 6h16M4 12h10M4 18h7m8-4 3 3-3 3" />,
    record: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
    route: <path d="M6 4a3 3 0 1 0 0 6h12a3 3 0 1 1 0 6H8m0 0 3-3m-3 3 3 3" />,
    settings: <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.3a7.9 7.9 0 0 0 .1-1.2 7.9 7.9 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a8.8 8.8 0 0 0-2-1.2L14.7 3h-5.4L9 5.6a8.8 8.8 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1.2c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a8.8 8.8 0 0 0 2 1.2l.3 2.6h5.4l.3-2.6a8.8 8.8 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5Z" />,
    users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m19 0v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6" />,
  };

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      {paths[name]}
    </svg>
  );
}

type VisibleUser = {
  id: string;
  name: string;
  displayName: string;
  avatarUrl: string | null;
  email: string;
  mobile: string | null;
  landline: string | null;
  voiceRoutingMode: string;
  voiceExtension: string | null;
  voiceAvailability: string;
  voiceLastSeenAt: Date | null;
  sipAddress: string | null;
  phoneSystemSettings: AgentConfig | null;
};

type QueueEntry = Prisma.CallQueueEntryGetPayload<{
  select: typeof activeQueueEntrySelect;
}>;

type RecentCall = Prisma.CallLogGetPayload<{
  select: typeof recentCallSelect;
}>;

type TwilioConfig = z.infer<typeof twilioStoredConfigSchema>;
type RecordingSettings = z.infer<typeof twilioRecordingSettingsSchema>;
type PhoneSystemConfig = Awaited<ReturnType<typeof getPhoneSystemConfig>>;
type ConfigQueue = PhoneSystemConfig["queues"][number];
type ConfigRoutingRule = PhoneSystemConfig["routingRules"][number];
type ConfigRoutingFlow = PhoneSystemConfig["routingFlow"];
type AgentConfig = PhoneSystemConfig["agentSettings"][number];
type BusinessDay = PhoneSystemConfig["businessHours"]["weekly"][number];
type BusinessHoliday = PhoneSystemConfig["businessHours"]["holidays"][number];
type BusinessAfterHours = PhoneSystemConfig["businessHours"]["afterHours"];

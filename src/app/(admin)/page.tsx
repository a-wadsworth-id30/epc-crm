import type { Metadata } from "next";
import type { SalesStage } from "@prisma/client";
import Link from "next/link";
import DashboardSetupPrompt from "@/components/crm-boilerplate/DashboardSetupPrompt";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import { LiveQueueTimer } from "@/components/crm-boilerplate/LiveQueueControls";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import RealtimePageRefresh from "@/components/crm-boilerplate/RealtimePageRefresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SidebarIcon, type SidebarIconName } from "@/layout/SidebarIcons";
import { requireUser } from "@/lib/auth";
import {
  dashboardMarketingWindowDays,
  getDashboardSummary,
} from "@/lib/dashboard/summary";
import {
  formatDisplayDate,
  formatDisplayLongDate,
  formatDisplayMoney,
  formatDisplayTime,
  parseDisplayDefaults,
  type DisplayFormattingContext,
} from "@/lib/display-defaults";
import { prisma } from "@/lib/prisma";
import { realtimeTopics } from "@/lib/realtime/topic-names";
import { getCrmSettings } from "@/lib/settings";
import { loadDashboardSetupPrompt } from "@/lib/setup/readiness";
import { routingAttempts } from "@/lib/telephony/call-routing";
import { liveQueueWhere } from "@/lib/telephony/twilio-voice";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "CRM Dashboard | iD30 CRM",
};

const openStages: SalesStage[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
];
const stageLabels: SalesStage[] = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
];

type ActivityKind = "Call" | "Communication" | "Note" | "Task";

type ActivityItem = {
  id: string;
  detail: string;
  href: string | null;
  kind: ActivityKind;
  occurredAt: Date;
  status: string | null;
  title: string;
};

type Suggestion = {
  cta: string;
  detail: string;
  href: string;
  tone: "brand" | "success" | "warning" | "error";
  title: string;
};

type DashboardHealth = {
  database: "ok" | "error";
  ok: boolean;
};

function formatMoney(
  valueCents: number,
  currency: string,
  formatting: DisplayFormattingContext,
) {
  return formatDisplayMoney(valueCents, currency, formatting);
}

function formatOptionalMoney(
  valueCents: number,
  currency: string,
  formatting: DisplayFormattingContext,
) {
  return valueCents > 0
    ? formatMoney(valueCents, currency, formatting)
    : "No spend";
}

function formatStage(stage: string) {
  return stage
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatShortDate(
  date: Date | null,
  formatting: DisplayFormattingContext,
) {
  if (!date) return "No date";

  return formatDisplayDate(date, formatting);
}

function formatDueDate(
  date: Date | null,
  formatting: DisplayFormattingContext,
) {
  if (!date) return "No due date";

  return `${formatShortDate(date, formatting)}, ${formatDisplayTime(
    date,
    formatting,
  )}`;
}

function formatActivityTime(date: Date, formatting: DisplayFormattingContext) {
  return `${formatShortDate(date, formatting)} ${formatDisplayTime(
    date,
    formatting,
  )}`;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "No duration";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return "";

  return `${contact.firstName} ${contact.lastName}`.trim();
}

function readableLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function buildSuggestions({
  missedCallTasks,
  openTasks,
  proposalCount,
  staleLeadCount,
}: {
  missedCallTasks: number;
  openTasks: number;
  proposalCount: number;
  staleLeadCount: number;
}) {
  const suggestions: Suggestion[] = [];

  if (missedCallTasks > 0) {
    suggestions.push({
      cta: "View tasks",
      detail: `${missedCallTasks} missed-call follow-up${missedCallTasks === 1 ? "" : "s"} need a response.`,
      href: "/tasks",
      title: "Follow up missed calls",
      tone: "error",
    });
  }

  if (staleLeadCount > 0) {
    suggestions.push({
      cta: "Review enquiries",
      detail: `${staleLeadCount} enquir${staleLeadCount === 1 ? "y" : "ies"} still need engagement or a next step.`,
      href: "/sales?stage=LEAD",
      title: "Nurture new enquiries",
      tone: "brand",
    });
  }

  if (proposalCount > 0) {
    suggestions.push({
      cta: "Open pipeline",
      detail: `${proposalCount} opportunit${proposalCount === 1 ? "y" : "ies"} may need quote follow-up.`,
      href: "/sales?stage=PROPOSAL",
      title: "Check opportunity follow-up",
      tone: "warning",
    });
  }

  if (openTasks > 0) {
    suggestions.push({
      cta: "Open tasks",
      detail: `${openTasks} open task${openTasks === 1 ? "" : "s"} across the team.`,
      href: "/tasks",
      title: "Clear outstanding work",
      tone: "success",
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      cta: "View activity",
      detail: "No urgent CRM signals. Review the latest activity for context.",
      href: "/notes",
      title: "Review recent activity",
      tone: "success",
    });
  }

  return suggestions.slice(0, 3);
}

async function checkDashboardHealth(): Promise<DashboardHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return {
      database: "ok",
      ok: true,
    };
  } catch {
    return {
      database: "error",
      ok: false,
    };
  }
}

export default async function DashboardPage() {
  const currentUser = await requireUser();
  const now = new Date();
  const setupPromptPromise =
    currentUser.role === "ADMIN"
      ? loadDashboardSetupPrompt(currentUser.id)
      : Promise.resolve(null);

  const [
    dashboardSummary,
    recentTasks,
    liveInboundCallCount,
    liveInboundCalls,
    recentNotes,
    recentCalls,
    recentCommunications,
    applicationHealth,
    settings,
    setupPrompt,
  ] = await Promise.all([
    getDashboardSummary(),
    prisma.task.findMany({
      take: 8,
      where: { status: { not: "DONE" } },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        dueDate: true,
        status: true,
        title: true,
        assignee: { select: { name: true } },
        company: { select: { name: true } },
        contact: { select: { firstName: true, id: true, lastName: true } },
      },
    }),
    prisma.callQueueEntry.count({
      where: liveQueueWhere(),
    }),
    prisma.callQueueEntry.findMany({
      where: liveQueueWhere(),
      orderBy: { queuedAt: "desc" },
      take: 3,
      select: {
        id: true,
        metadata: true,
        queuedAt: true,
        status: true,
        assignedUser: { select: { name: true } },
        contact: { select: { firstName: true, lastName: true } },
        opportunity: { select: { title: true } },
      },
    }),
    prisma.note.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        createdAt: true,
        company: { select: { name: true } },
        contact: { select: { firstName: true, id: true, lastName: true } },
        user: { select: { name: true } },
      },
    }),
    prisma.callLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        direction: true,
        durationSeconds: true,
        startedAt: true,
        status: true,
        contact: { select: { firstName: true, id: true, lastName: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
    prisma.salesCommunication.findMany({
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: {
        id: true,
        channel: true,
        direction: true,
        occurredAt: true,
        subject: true,
        contact: { select: { firstName: true, lastName: true } },
        opportunity: { select: { id: true, title: true } },
      },
    }),
    checkDashboardHealth(),
    getCrmSettings(),
    setupPromptPromise,
  ]);

  const {
    companies,
    contacts,
    marketing,
    missedCallTasksCount,
    openTaskCount,
    stageMetrics,
  } = dashboardSummary;
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const displayDefaults = parseDisplayDefaults(settings.displayDefaults);
  const displayFormatting = { displayDefaults, workspaceDefaults };
  const currency = dashboardSummary.currency ?? workspaceDefaults.currency;
  const stageMetricsByStage = new Map(
    stageMetrics.map((row) => [
      row.stage,
      {
        count: row.count,
        valueCents: row.valueCents,
      },
    ]),
  );
  const openOpportunityStats = openStages.reduce(
    (stats, stage) => {
      const stageMetrics = stageMetricsByStage.get(stage);

      return {
        count: stats.count + (stageMetrics?.count ?? 0),
        valueCents: stats.valueCents + (stageMetrics?.valueCents ?? 0),
      };
    },
    { count: 0, valueCents: 0 },
  );
  const openPipelineValue = openOpportunityStats.valueCents;
  const leadCount = stageMetricsByStage.get("LEAD")?.count ?? 0;
  const proposalCount = stageMetricsByStage.get("PROPOSAL")?.count ?? 0;
  const healthTone: "error" | "success" = applicationHealth.ok
    ? "success"
    : "error";
  const healthValue = applicationHealth.ok ? "Healthy" : "Check failed";
  const healthDetail =
    applicationHealth.database === "ok"
      ? "Database connection ok"
      : "Database connection error";
  const contactsLabel = `${contacts} ${contacts === 1 ? "person" : "people"}`;
  const stageSummary = stageLabels.map((stage) => {
    const stageMetrics = stageMetricsByStage.get(stage);

    return {
      count: stageMetrics?.count ?? 0,
      stage,
      valueCents: stageMetrics?.valueCents ?? 0,
    };
  });
  const largestStageValue = Math.max(
    1,
    ...stageSummary.map((stage) =>
      Math.max(stage.count, Math.round(stage.valueCents / 10000)),
    ),
  );
  const taskRows = recentTasks.map((task) => {
    const name = contactName(task.contact);
    const related = name || task.company?.name || "Unassigned";
    const isMissedCall = task.title.startsWith("Missed call");

    return {
      due: task.dueDate,
      href: task.contact ? `/contacts/${task.contact.id}` : "/tasks",
      id: task.id,
      owner: task.assignee?.name ?? "Unassigned",
      priority: isMissedCall ? "High" : task.dueDate ? "Medium" : "Normal",
      related,
      status: task.status,
      title: task.title,
      type: isMissedCall ? "Call" : "Task",
    };
  });
  const activityItems: ActivityItem[] = [
    ...recentNotes.map((note) => {
      const name = contactName(note.contact);

      return {
        detail: note.company?.name ?? (name || note.user.name),
        href: note.contact ? `/contacts/${note.contact.id}` : null,
        id: `note-${note.id}`,
        kind: "Note" as const,
        occurredAt: note.createdAt,
        status: null,
        title: name ? `Note for ${name}` : "CRM note",
      };
    }),
    ...recentCalls.map((call) => {
      const name = contactName(call.contact);

      return {
        detail: `${readableLabel(call.direction)} / ${formatDuration(call.durationSeconds)}`,
        href: call.opportunity
          ? `/sales/${call.opportunity.id}`
          : call.contact
            ? `/contacts/${call.contact.id}`
            : null,
        id: `call-${call.id}`,
        kind: "Call" as const,
        occurredAt: call.startedAt,
        status: call.status,
        title: name
          ? `Call with ${name}`
          : (call.opportunity?.title ?? "Phone call"),
      };
    }),
    ...recentCommunications.map((communication) => {
      const name = contactName(communication.contact);

      return {
        detail: communication.opportunity.title,
        href: `/sales/${communication.opportunity.id}`,
        id: `communication-${communication.id}`,
        kind: "Communication" as const,
        occurredAt: communication.occurredAt,
        status: communication.direction,
        title:
          communication.subject ??
          (name || `${readableLabel(communication.channel)} message`),
      };
    }),
  ]
    .sort(
      (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime(),
    )
    .slice(0, 6);
  const suggestions = buildSuggestions({
    missedCallTasks: missedCallTasksCount,
    openTasks: openTaskCount,
    proposalCount,
    staleLeadCount: leadCount,
  });

  return (
    <>
      <RealtimePageRefresh
        fallbackIntervalMs={120000}
        topics={[realtimeTopics.telephony, realtimeTopics.tasks]}
      />
      <PageHeader
        title="Dashboard"
        description={`Today is ${formatDisplayLongDate(
          now,
          displayFormatting,
        )}. Focus on the work, calls and opportunities that need attention.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/sales">
                <SidebarIcon name="circle-dollar-sign" />
                Sales pipeline
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/marketing">
                <SidebarIcon name="megaphone" />
                Marketing overview
              </Link>
            </Button>
            <Button asChild>
              <Link href="/tasks">
                <SidebarIcon name="list-todo" />
                Open tasks
              </Link>
            </Button>
          </>
        }
      />

      {setupPrompt ? <DashboardSetupPrompt prompt={setupPrompt} /> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <DashboardMetric
          detail={`${openOpportunityStats.count} active opportunities`}
          href="/sales?stage=open"
          iconName="circle-dollar-sign"
          label="Pipeline"
          tone="brand"
          value={formatMoney(openPipelineValue, currency, displayFormatting)}
        />
        <DashboardMetric
          detail="Enquiry-stage sales"
          href="/sales?stage=LEAD"
          iconName="users-round"
          label="Enquiries"
          tone="success"
          value={leadCount}
        />
        <DashboardMetric
          detail="Tasks not yet done"
          href="/tasks"
          iconName="list-todo"
          label="Open tasks"
          tone="warning"
          value={openTaskCount}
        />
        <DashboardMetric
          detail="Open missed-call follow-ups"
          href="/tasks"
          iconName="headphones"
          label="Missed calls"
          tone="error"
          value={missedCallTasksCount}
        />
        <DashboardMetric
          detail={`${companies} companies`}
          href="/contacts"
          iconName="users-round"
          label="Contacts"
          tone="purple"
          value={contactsLabel}
        />
        <DashboardMetric
          detail={healthDetail}
          href="/settings/system"
          iconName="square-check-big"
          label="App health"
          tone={healthTone}
          value={healthValue}
        />
      </div>

      <DashboardSectionCard
        className="mt-5"
        title="Marketing snapshot"
        description={`Attribution and ad-platform signals from the last ${dashboardMarketingWindowDays} days.`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/marketing">Open Marketing</Link>
          </Button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MarketingSnapshotCard
            iconName="chart-column"
            label="Tracked sessions"
            value={marketing.sessions.toString()}
            detail="Visitor sessions updated in the reporting window"
          />
          <MarketingSnapshotCard
            iconName="users-round"
            label="Attributed leads"
            value={marketing.attributedLeadCount.toString()}
            detail={`${marketing.formLeadCount} forms / ${marketing.phoneLeadCount} calls`}
          />
          <MarketingSnapshotCard
            iconName="circle-dollar-sign"
            label="Imported ad spend"
            value={formatOptionalMoney(
              marketing.importedSpendCents,
              currency,
              displayFormatting,
            )}
            detail={`${marketing.importedClicks} clicks imported`}
          />
          <MarketingSnapshotCard
            iconName="square-check-big"
            label="Platform conversions"
            value={Math.round(marketing.importedConversions).toString()}
            detail="Conversions from connected ad platforms"
          />
        </div>
      </DashboardSectionCard>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.75fr)_360px]">
        <DashboardSectionCard
          title="Today's work"
          description="Open tasks, missed-call follow-ups and sales actions that need attention."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/tasks">View all</Link>
            </Button>
          }
          contentClassName="p-0"
        >
          {taskRows.length ? (
            <>
              <div className="divide-y divide-gray-100 md:hidden dark:divide-gray-800">
                {taskRows.map((task) => (
                  <div key={task.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={task.href}
                          className="line-clamp-2 text-sm font-semibold text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-300"
                        >
                          {task.title}
                        </Link>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {task.type} / {task.owner}
                        </p>
                      </div>
                      <PriorityBadge value={task.priority} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <div>
                        <p className="font-medium text-gray-400 uppercase dark:text-gray-500">
                          Related
                        </p>
                        <p className="mt-1 text-gray-700 dark:text-gray-300">
                          {task.related}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-gray-400 uppercase dark:text-gray-500">
                          Due
                        </p>
                        <p className="mt-1 text-gray-700 dark:text-gray-300">
                          {formatDueDate(task.due, displayFormatting)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Badge variant="outline">{task.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work</TableHead>
                      <TableHead>Related</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taskRows.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          <Link
                            href={task.href}
                            className="font-medium text-gray-800 hover:text-brand-600 dark:text-white/90 dark:hover:text-brand-300"
                          >
                            {task.title}
                          </Link>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {task.type} / {task.owner}
                          </div>
                        </TableCell>
                        <TableCell>{task.related}</TableCell>
                        <TableCell>
                          {formatDueDate(task.due, displayFormatting)}
                        </TableCell>
                        <TableCell>
                          <PriorityBadge value={task.priority} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{task.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No open work"
                description="Tasks and missed-call follow-ups will appear here when they need attention."
              />
            </div>
          )}
        </DashboardSectionCard>

        <DashboardSectionCard
          title="Pipeline snapshot"
          description="Opportunity count and value by stage."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/sales">View all</Link>
            </Button>
          }
          contentClassName="p-0"
        >
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {stageSummary.map((stage) => (
              <div key={stage.stage} className="px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                      {formatStage(stage.stage)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {stage.count} deal{stage.count === 1 ? "" : "s"} /{" "}
                      {formatMoney(
                        stage.valueCents,
                        currency,
                        displayFormatting,
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary">{stage.stage}</Badge>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-gray-100 dark:bg-white/[0.06]">
                  <div
                    className="h-1.5 rounded-full bg-brand-500"
                    style={{
                      width: `${Math.max(4, Math.min(100, (Math.max(stage.count, Math.round(stage.valueCents / 10000)) / largestStageValue) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </DashboardSectionCard>

        <aside className="space-y-5">
          <DashboardSectionCard
            title="Live calls"
            description="Current inbound queue state."
            actions={
              <Badge variant="success">{`${liveInboundCallCount} ACTIVE`}</Badge>
            }
            contentClassName="p-0"
          >
            {liveInboundCalls.length ? (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {liveInboundCalls.map((entry) => {
                  const contact = contactName(entry.contact);
                  const attempts = routingAttempts(entry.metadata);
                  const metadata = metadataObject(entry.metadata);
                  const routeName =
                    stringMetadata(metadata, "queueName") ||
                    stringMetadata(metadata, "routingRuleName") ||
                    "Default route";

                  return (
                    <div key={entry.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                            {contact ||
                              entry.opportunity?.title ||
                              "Unknown caller"}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {routeName} /{" "}
                            {entry.assignedUser?.name ?? "Waiting for agent"}
                          </p>
                        </div>
                        <Badge variant="outline">{entry.status}</Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>
                          Waiting{" "}
                          <LiveQueueTimer
                            queuedAt={entry.queuedAt.toISOString()}
                          />
                        </span>
                        <span>{attempts.length} attempts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-5 text-sm text-gray-600 dark:text-gray-400">
                No live inbound calls. New routed calls will appear here.
              </div>
            )}
            <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-800">
              <Link
                href="/telephony/live"
                className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Open monitoring
              </Link>
            </div>
          </DashboardSectionCard>

          <DashboardSectionCard
            title="AI suggested next steps"
            description="Rule-based now; ready for conversation-aware AI."
            actions={<Badge>Beta</Badge>}
          >
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.title}
                  suggestion={suggestion}
                />
              ))}
            </div>
          </DashboardSectionCard>
        </aside>
      </div>

      <DashboardSectionCard
        className="mt-5"
        title="Recent activity"
        description="Latest notes, calls and communication events."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/notes">View all</Link>
          </Button>
        }
        contentClassName="p-0"
      >
        {activityItems.length ? (
          <div className="grid divide-y divide-gray-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0 dark:divide-gray-800">
            {activityItems.map((item) => (
              <ActivityRow
                displayFormatting={displayFormatting}
                item={item}
                key={item.id}
              />
            ))}
          </div>
        ) : (
          <div className="p-5">
            <EmptyState
              title="No activity yet"
              description="Notes, calls and sales communications will appear here as the CRM is used."
            />
          </div>
        )}
      </DashboardSectionCard>
    </>
  );
}

function DashboardSectionCard({
  actions,
  children,
  className,
  contentClassName,
  description,
  title,
}: {
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  description: string;
  title: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-0.5">{description}</CardDescription>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

function DashboardMetric({
  detail,
  href,
  iconName,
  label,
  tone,
  value,
}: {
  detail: string;
  href: string;
  iconName: SidebarIconName;
  label: string;
  tone: "brand" | "error" | "purple" | "success" | "warning";
  value: string | number;
}) {
  const toneClass = {
    brand:
      "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300",
    error:
      "bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-300",
    purple:
      "bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-300",
    success:
      "bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300",
    warning:
      "bg-warning-50 text-warning-600 dark:bg-warning-900/20 dark:text-warning-300",
  }[tone];

  return (
    <Link
      href={href}
      className="group block rounded-xl focus-visible:ring-3 focus-visible:ring-brand-500/15 focus-visible:outline-none"
    >
      <Card className="h-full overflow-hidden transition group-hover:border-brand-200 group-hover:shadow-theme-sm dark:group-hover:border-brand-800">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${toneClass}`}
            >
              <SidebarIcon name={iconName} className="h-5 w-5" />
            </span>
            <span className="text-xs font-medium text-brand-600 opacity-0 transition group-hover:opacity-100 dark:text-brand-400">
              Open
            </span>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
            {detail}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

function MarketingSnapshotCard({
  detail,
  iconName,
  label,
  value,
}: {
  detail: string;
  iconName: SidebarIconName;
  label: string;
  value: string;
}) {
  return (
    <div className="h-full rounded-lg border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex h-full items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300">
          <SidebarIcon name={iconName} className="h-5 w-5" />
        </span>
        <div className="min-w-0 self-center">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
          <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
            {detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function PriorityBadge({ value }: { value: string }) {
  return (
    <Badge
      variant={
        value === "High"
          ? "destructive"
          : value === "Medium"
            ? "warning"
            : "secondary"
      }
    >
      {value}
    </Badge>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const toneClass = {
    brand:
      "bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-300",
    error:
      "bg-error-50 text-error-600 dark:bg-error-900/20 dark:text-error-300",
    success:
      "bg-success-50 text-success-600 dark:bg-success-900/20 dark:text-success-300",
    warning:
      "bg-warning-50 text-warning-600 dark:bg-warning-900/20 dark:text-warning-300",
  }[suggestion.tone];

  return (
    <Link
      href={suggestion.href}
      className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 p-3 transition hover:border-brand-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-brand-800 dark:hover:bg-white/[0.04]"
    >
      <div className="flex min-w-0 gap-3">
        <span
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}
        >
          <SidebarIcon name="layout-dashboard" className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-gray-800 dark:text-white/90">
            {suggestion.title}
          </span>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            {suggestion.detail}
          </span>
        </span>
      </div>
      <span className="shrink-0 text-xs font-medium text-brand-600 dark:text-brand-400">
        {suggestion.cta}
      </span>
    </Link>
  );
}

function activityIconName(kind: ActivityKind): SidebarIconName {
  const icons = {
    Call: "headphones",
    Communication: "inbox",
    Note: "clipboard-list",
    Task: "list-todo",
  } satisfies Record<ActivityKind, SidebarIconName>;

  return icons[kind];
}

function ActivityRow({
  displayFormatting,
  item,
}: {
  displayFormatting: DisplayFormattingContext;
  item: ActivityItem;
}) {
  const content = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
        <SidebarIcon name={activityIconName(item.kind)} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
              {item.title}
            </p>
            <p className="mt-1 line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
              {item.detail}
            </p>
          </div>
          <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {formatActivityTime(item.occurredAt, displayFormatting)}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300">
            {item.kind}
          </span>
          {item.status && <Badge variant="outline">{item.status}</Badge>}
        </div>
      </div>
    </div>
  );

  return item.href ? (
    <Link
      href={item.href}
      className="block transition hover:bg-gray-50 dark:hover:bg-white/[0.04]"
    >
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

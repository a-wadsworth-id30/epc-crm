import type { Metadata } from "next";
import Link from "next/link";
import EmptyState from "@/components/crm-boilerplate/EmptyState";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SectionHeader from "@/components/crm-boilerplate/SectionHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Notes / Activity | iD30 CRM",
  description: "CRM activity timeline across notes, calls, communications and tasks.",
};

type ActivityKind = "Note" | "Call" | "Communication" | "Task";

type ActivityItem = {
  id: string;
  actor: string;
  date: Date;
  detail: string;
  href: string | null;
  kind: ActivityKind;
  related: string;
  status: string | null;
  summary: string;
  title: string;
};

const activityDateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "short",
});

const activityKindStyles: Record<ActivityKind, string> = {
  Note: "bg-brand-50 text-brand-700 ring-brand-100 dark:bg-brand-900/20 dark:text-brand-300 dark:ring-brand-900/40",
  Call: "bg-success-50 text-success-700 ring-success-100 dark:bg-success-900/20 dark:text-success-300 dark:ring-success-900/40",
  Communication: "bg-purple-50 text-purple-700 ring-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:ring-purple-900/40",
  Task: "bg-warning-50 text-warning-700 ring-warning-100 dark:bg-warning-900/20 dark:text-warning-300 dark:ring-warning-900/40",
};

function contactName(contact: { firstName: string; lastName: string } | null) {
  if (!contact) return "";

  return `${contact.firstName} ${contact.lastName}`.trim();
}

function formatActivityDate(date: Date) {
  return activityDateFormatter.format(date);
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "No duration";

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return minutes ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
}

function readableLabel(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}

export default async function NotesPage() {
  const [
    notes,
    calls,
    communications,
    tasks,
    totalNotes,
    totalCalls,
    totalCommunications,
    openTasks,
  ] = await Promise.all([
    prisma.note.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { company: true, contact: true, user: true },
    }),
    prisma.callLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { contact: true, opportunity: true, user: true },
    }),
    prisma.salesCommunication.findMany({
      orderBy: { occurredAt: "desc" },
      take: 30,
      include: { contact: true, opportunity: true, user: true },
    }),
    prisma.task.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { assignee: true, company: true, contact: true, creator: true },
    }),
    prisma.note.count(),
    prisma.callLog.count(),
    prisma.salesCommunication.count(),
    prisma.task.count({ where: { status: { not: "DONE" } } }),
  ]);

  const noteItems: ActivityItem[] = notes.map((note) => {
    const name = contactName(note.contact);

    return {
      id: `note-${note.id}`,
      actor: note.user.name,
      date: note.createdAt,
      detail: note.company?.name ?? "General CRM note",
      href: note.contact ? `/contacts/${note.contact.id}` : null,
      kind: "Note",
      related: name || note.company?.name || "General",
      status: null,
      summary: note.body,
      title: name ? `Note for ${name}` : note.company?.name ?? "General note",
    };
  });

  const callItems: ActivityItem[] = calls.map((call) => {
    const name = contactName(call.contact);
    const direction = readableLabel(call.direction);
    const route = [call.fromNumber, call.toNumber].filter(Boolean).join(" to ");

    return {
      id: `call-${call.id}`,
      actor: call.user?.name ?? "Phone system",
      date: call.startedAt,
      detail: call.opportunity?.title ?? (route || "Unlinked call"),
      href: call.opportunity
        ? `/sales/${call.opportunity.id}`
        : call.contact
          ? `/contacts/${call.contact.id}`
          : null,
      kind: "Call",
      related: name || call.opportunity?.title || "Unknown caller",
      status: call.status,
      summary: `${direction} call / ${formatDuration(call.durationSeconds)}`,
      title: name ? `${direction} call with ${name}` : `${direction} call`,
    };
  });

  const communicationItems: ActivityItem[] = communications.map((communication) => {
    const name = contactName(communication.contact);
    const channel = readableLabel(communication.channel);

    return {
      id: `communication-${communication.id}`,
      actor: communication.user?.name ?? "CRM system",
      date: communication.occurredAt,
      detail: communication.opportunity.title,
      href: `/sales/${communication.opportunity.id}`,
      kind: "Communication",
      related: name || communication.opportunity.title,
      status: communication.direction,
      summary: communication.summary,
      title: communication.subject ?? `${channel} communication`,
    };
  });

  const taskItems: ActivityItem[] = tasks.map((task) => {
    const name = contactName(task.contact);

    return {
      id: `task-${task.id}`,
      actor: task.assignee?.name ?? task.creator.name,
      date: task.updatedAt,
      detail: task.company?.name ?? "Unassigned company",
      href: task.contact ? `/contacts/${task.contact.id}` : null,
      kind: "Task",
      related: name || task.company?.name || "Unassigned",
      status: task.status,
      summary: task.description ?? "No description added.",
      title: task.title,
    };
  });

  const activityItems = [
    ...noteItems,
    ...callItems,
    ...communicationItems,
    ...taskItems,
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 50);
  const latestActivity = activityItems[0]?.date ?? null;
  const linkedActivityCount = activityItems.filter((item) => item.href).length;

  return (
    <>
      <PageHeader
        title="Notes / Activity"
        description="Review CRM notes and recent operational activity across contacts, sales, calls and tasks."
        actions={
          <>
            <Link
              href="/contacts"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Contacts
            </Link>
            <Link
              href="/tasks"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
            >
              Tasks
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Notes" value={totalNotes} detail="Saved CRM notes" />
        <MetricCard label="Calls" value={totalCalls} detail="Logged phone activity" />
        <MetricCard
          label="Communications"
          value={totalCommunications}
          detail="Sales-linked messages"
        />
        <MetricCard label="Open tasks" value={openTasks} detail="Tasks not yet done" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <SectionHeader
            title="Activity timeline"
            description="Latest notes, calls, sales communications and task updates in one chronological view."
            help="Shows recent CRM activity across core records so users can understand what changed without opening each record first."
          />
          {activityItems.length ? (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {activityItems.map((item) => (
                <ActivityRow item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No activity yet"
                description="Notes, calls, sales communications and task updates will appear here once CRM records are created."
              />
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Activity health
              </h2>
              <LazyHelpTooltip content="Summarises whether recent activity is linked back to contacts, sales or tasks rather than sitting as isolated records." />
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="Latest activity"
                value={latestActivity ? formatActivityDate(latestActivity) : "None yet"}
              />
              <SummaryRow
                label="Linked records"
                value={`${linkedActivityCount}/${activityItems.length}`}
              />
              <SummaryRow label="Timeline rows" value={activityItems.length.toString()} />
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Activity mix
              </h2>
              <LazyHelpTooltip content="Breaks the timeline into the record types that currently feed this workspace." />
            </div>
            <div className="mt-4 space-y-3">
              <MixRow kind="Note" value={noteItems.length} />
              <MixRow kind="Call" value={callItems.length} />
              <MixRow kind="Communication" value={communicationItems.length} />
              <MixRow kind="Task" value={taskItems.length} />
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <article className="grid gap-4 p-5 sm:grid-cols-[44px_minmax(0,1fr)]">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold ring-1 ${
          activityKindStyles[item.kind]
        }`}
      >
        {item.kind.slice(0, 1)}
      </div>
      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-800 dark:text-white/90">{item.title}</h2>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                  activityKindStyles[item.kind]
                }`}
              >
                {item.kind}
              </span>
              {item.status ? <StatusBadge>{item.status}</StatusBadge> : null}
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
              {item.summary}
            </p>
          </div>
          <time
            className="shrink-0 text-sm text-gray-500 dark:text-gray-400"
            dateTime={item.date.toISOString()}
          >
            {formatActivityDate(item.date)}
          </time>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span>Owner: {item.actor}</span>
          <span>Record: {item.related}</span>
          <span>{item.detail}</span>
        </div>
        {item.href ? (
          <Link
            href={item.href}
            className="mt-3 inline-flex text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300"
          >
            Open related record
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function MixRow({ kind, value }: { kind: ActivityKind; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold ring-1 ${
            activityKindStyles[kind]
          }`}
        >
          {kind.slice(0, 1)}
        </span>
        <span className="text-sm font-medium text-gray-800 dark:text-white/90">{kind}</span>
      </div>
      <span className="text-sm font-semibold text-gray-800 dark:text-white/90">{value}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800 dark:text-white/90">{value}</dd>
    </div>
  );
}

"use client";

import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FolderOpen,
  Globe2,
  GripVertical,
  History,
  ListChecks,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import type { CompanyOperationalOverview } from "@/lib/companies/operational-overview";

type CompanyWorkspaceTabKey =
  | "overview"
  | "activity"
  | "contacts"
  | "leads"
  | "documents";

type CompanyWorkspaceTab = {
  key: CompanyWorkspaceTabKey;
  label: string;
  description: string;
  Icon: LucideIcon;
};

type CompanyDetailWorkspaceProps = {
  activityPanel: ReactNode;
  contactsCount: number;
  detailPanel: ReactNode;
  documentsCount: number;
  documentsPanel: ReactNode;
  leadsCount: number;
  leadsPanel: ReactNode;
  linkedRecordsPanel: ReactNode;
  operationalOverview: CompanyOperationalOverview;
  contactsPanel: ReactNode;
  summary: {
    addressLabel: string;
    companyName: string;
    companyTypeLabel: string;
    domain: string | null;
    owner: string | null;
    status: string;
  };
};

function formatLatestActivity(value: string | null) {
  if (!value) return "No activity recorded";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function CompanyOperationalOverviewPanel({
  onSelectTab,
  overview,
}: {
  onSelectTab: (tab: CompanyWorkspaceTabKey) => void;
  overview: CompanyOperationalOverview;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40">
          <ListChecks className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Operational overview
          </h2>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
            Existing CRM records that may need attention.
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Active Sales
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {overview.activeSalesCount}
          </dd>
        </div>
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
          <dt className="text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
            Open tasks
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
            {overview.openTaskCount}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Latest activity: {formatLatestActivity(overview.latestActivityAt)}
      </p>

      <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
          Needs attention
        </h3>
        {overview.attention.length ? (
          <ul className="mt-2 space-y-2">
            {overview.attention.map((item) => (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 dark:border-warning-500/20 dark:bg-warning-500/10"
                key={item.key}
              >
                <span className="text-xs font-medium text-warning-800 dark:text-warning-200">
                  {item.label}
                </span>
                <button
                  className="shrink-0 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline dark:text-brand-400"
                  onClick={() => onSelectTab(item.tab)}
                  type="button"
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-lg bg-success-50 px-3 py-2 text-xs font-medium text-success-700 dark:bg-success-500/10 dark:text-success-300">
            No immediate configured workflow gaps detected.
          </p>
        )}
      </div>
    </section>
  );
}

const workspaceTabs: CompanyWorkspaceTab[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Company profile, status, owner and address",
    Icon: Building2,
  },
  {
    key: "activity",
    label: "Activity",
    description: "Communications, notes and tasks across connected records",
    Icon: History,
  },
  {
    key: "contacts",
    label: "Contacts",
    description: "People linked to this organisation",
    Icon: UsersRound,
  },
  {
    key: "leads",
    label: "Leads & Deals",
    description: "Sales records linked to this company",
    Icon: ClipboardList,
  },
  {
    key: "documents",
    label: "Documents",
    description: "Files, upload links, shares and signatures",
    Icon: FolderOpen,
  },
];

function orderedKeys<T extends string>(saved: unknown, fallback: readonly T[]) {
  if (!Array.isArray(saved)) return [...fallback];

  const allowed = new Set<T>(fallback);
  const clean = saved.filter(
    (item): item is T => typeof item === "string" && allowed.has(item as T),
  );
  const result = [...new Set(clean)];

  fallback
    .filter((key) => !result.includes(key))
    .forEach((key) => {
      const fallbackIndex = fallback.indexOf(key);
      const previousKey = fallback
        .slice(0, fallbackIndex)
        .reverse()
        .find((candidate) => result.includes(candidate));
      const nextKey = fallback
        .slice(fallbackIndex + 1)
        .find((candidate) => result.includes(candidate));

      if (previousKey) {
        result.splice(result.indexOf(previousKey) + 1, 0, key);
      } else if (nextKey) {
        result.splice(result.indexOf(nextKey), 0, key);
      } else {
        result.push(key);
      }
    });

  return result;
}

function readStoredKeys<T extends string>(
  storageKey: string,
  fallback: readonly T[],
) {
  if (typeof window === "undefined") return [...fallback];

  try {
    return orderedKeys(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      fallback,
    );
  } catch {
    return [...fallback];
  }
}

function moveKey<T extends string>(keys: T[], from: T, to: T) {
  if (from === to) return keys;
  const next = keys.filter((key) => key !== from);
  const targetIndex = next.indexOf(to);
  if (targetIndex < 0) return keys;
  next.splice(targetIndex, 0, from);
  return next;
}

function saveStoredKeys<T extends string>(storageKey: string, keys: T[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(keys));
}

function CompanyWorkspaceSummary({
  contactsCount,
  documentsCount,
  leadsCount,
  summary,
}: {
  contactsCount: number;
  documentsCount: number;
  leadsCount: number;
  summary: CompanyDetailWorkspaceProps["summary"];
}) {
  const metrics = [
    {
      Icon: Globe2,
      label: "Domain",
      value: summary.domain || "Not captured",
    },
    {
      Icon: BriefcaseBusiness,
      label: "Status",
      value: summary.status,
    },
    {
      Icon: UserRound,
      label: "Owner",
      value: summary.owner || "Unassigned",
    },
    {
      Icon: UsersRound,
      label: "Contacts",
      value: `${contactsCount} linked`,
    },
    {
      Icon: ClipboardList,
      label: "Leads",
      value: `${leadsCount} linked`,
    },
    {
      Icon: FolderOpen,
      label: "Documents",
      value: `${documentsCount} file${documentsCount === 1 ? "" : "s"}`,
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                Company workspace
              </h2>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40">
                {summary.companyTypeLabel}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {summary.companyName} | {summary.addressLabel}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.Icon;

          return (
            <div
              key={metric.label}
              className="min-w-0 border-b border-gray-100 px-4 py-4 sm:border-r 2xl:border-b-0 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 ring-1 ring-gray-100 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {metric.label}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm leading-5 font-semibold text-gray-900 dark:text-white">
                    {metric.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function CompanyDetailWorkspace({
  activityPanel,
  contactsCount,
  contactsPanel,
  detailPanel,
  documentsCount,
  documentsPanel,
  leadsCount,
  leadsPanel,
  linkedRecordsPanel,
  operationalOverview,
  summary,
}: CompanyDetailWorkspaceProps) {
  const [activeTab, setActiveTab] =
    useState<CompanyWorkspaceTabKey>("overview");
  const [workspaceTabOrder, setWorkspaceTabOrder] = useState(() =>
    readStoredKeys(
      "id30:company-detail:workspace-tabs",
      workspaceTabs.map((tab) => tab.key),
    ),
  );
  const [draggedTab, setDraggedTab] = useState<CompanyWorkspaceTabKey | null>(
    null,
  );
  const tabsByKey = useMemo(
    () => new Map(workspaceTabs.map((tab) => [tab.key, tab])),
    [],
  );
  const orderedTabs = workspaceTabOrder
    .map((key) => tabsByKey.get(key))
    .filter((tab): tab is CompanyWorkspaceTab => Boolean(tab));

  function reorderWorkspaceTabs(targetKey: CompanyWorkspaceTabKey) {
    if (!draggedTab) return;
    const next = moveKey(workspaceTabOrder, draggedTab, targetKey);
    setWorkspaceTabOrder(next);
    saveStoredKeys("id30:company-detail:workspace-tabs", next);
    setDraggedTab(null);
  }

  return (
    <div className="min-w-0 space-y-4">
      <CompanyWorkspaceSummary
        contactsCount={contactsCount}
        documentsCount={documentsCount}
        leadsCount={leadsCount}
        summary={summary}
      />

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px] 3xl:grid-cols-[minmax(0,1fr)_390px]">
        <main className="min-w-0 space-y-4">
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="grid min-w-0 lg:grid-cols-[184px_minmax(0,1fr)]">
              <nav
                className="flex min-w-0 overflow-x-auto border-b border-gray-200 bg-gray-50/80 p-1.5 lg:block lg:overflow-visible lg:border-r lg:border-b-0 lg:p-0 dark:border-gray-800 dark:bg-white/[0.02]"
                aria-label="Company workspace sections"
              >
                {orderedTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  const Icon = tab.Icon;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      draggable
                      onDragStart={() => setDraggedTab(tab.key)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => reorderWorkspaceTabs(tab.key)}
                      onClick={() => setActiveTab(tab.key)}
                      className={`group flex min-w-[148px] items-center gap-3 px-3 py-3 text-left text-sm transition lg:w-[calc(100%+1px)] lg:min-w-0 lg:border-b lg:border-gray-200 lg:last:border-b-0 dark:lg:border-gray-800 ${
                        isActive
                          ? "rounded-xl bg-white text-brand-700 shadow-theme-xs ring-1 ring-gray-200 lg:rounded-none lg:shadow-none lg:ring-0 dark:bg-gray-950 dark:text-brand-300 dark:ring-gray-800"
                          : "text-gray-600 hover:bg-white/70 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.04] dark:hover:text-white"
                      }`}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-gray-300 lg:block" />
                      <span
                        className={`inline-grid h-9 w-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${
                          isActive
                            ? "bg-brand-50 text-brand-600 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-900/40"
                            : "bg-white text-gray-500 ring-gray-200 group-hover:text-gray-800 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-gray-800"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {tab.label}
                        </span>
                        <span className="mt-0.5 hidden text-xs leading-4 text-gray-500 lg:line-clamp-2 dark:text-gray-400">
                          {tab.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </nav>

              <div className="min-w-0 bg-white dark:bg-white/[0.03]">
                {activeTab === "overview" ? detailPanel : null}
                {activeTab === "activity" ? activityPanel : null}
                {activeTab === "contacts" ? contactsPanel : null}
                {activeTab === "leads" ? leadsPanel : null}
                {activeTab === "documents" ? documentsPanel : null}
              </div>
            </div>
          </section>
        </main>

        <aside className="grid min-w-0 content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <CompanyOperationalOverviewPanel
            onSelectTab={setActiveTab}
            overview={operationalOverview}
          />
          {linkedRecordsPanel}
        </aside>
      </div>
    </div>
  );
}

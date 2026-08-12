import type { Metadata } from "next";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  KeyRound,
  Mail,
  Megaphone,
  Phone,
  SearchCheck,
  ShieldCheck,
  Users2,
} from "lucide-react";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import { requireAdmin } from "@/lib/auth";
import {
  completionStatus,
  loadSetupReadiness,
  setupStatusLabel,
  type SetupGroup,
  type SetupIconKey,
} from "@/lib/setup/readiness";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Setup | iD30 CRM",
};

const setupIconMap: Record<SetupIconKey, ComponentType<{ className?: string }>> = {
  company: Building2,
  "customer-acquisition": Megaphone,
  operations: Database,
  "secure-access": ShieldCheck,
};

export default async function SetupSettingsPage() {
  await requireAdmin();
  const readiness = await loadSetupReadiness();
  const {
    actionableCount,
    activeUserCount,
    adminCount,
    completionPercent,
    groups,
    neededCount,
    readyCount,
    warningCount,
  } = readiness;

  return (
    <>
      <PageHeader
        title="Client Setup"
        description="Review the key setup areas a client needs before the CRM is ready for day-to-day use."
      />

      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Setup complete"
            value={`${completionPercent}%`}
            detail={`${readyCount} of ${actionableCount} active checks ready`}
            icon={SearchCheck}
          />
          <MetricCard
            label="Needs setup"
            value={neededCount}
            detail="Blocking items before handover"
            icon={KeyRound}
          />
          <MetricCard
            label="Warnings"
            value={warningCount}
            detail="Recommended hardening or optional setup"
            icon={ShieldCheck}
          />
          <MetricCard
            label="Team users"
            value={activeUserCount}
            detail={`${adminCount} active admin${adminCount === 1 ? "" : "s"}`}
            icon={Users2}
          />
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white/90">
                  Handover Readiness
                </h2>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                Work through the needed items first, then clear warnings before
                handing the workspace to a client admin.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link
                href="/settings/system"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]"
              >
                System health
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/settings/users"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 font-medium text-white shadow-theme-xs transition hover:bg-brand-600"
              >
                Add users
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          {groups.map((group) => (
            <SetupGroupCard key={group.title} group={group} />
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <QuickLinkCard
            href="/settings/company"
            icon={Building2}
            title="Company and brand"
            detail="Identity, app logo, colours, document defaults and company address."
          />
          <QuickLinkCard
            href="/settings/integrations"
            icon={Mail}
            title="Integrations"
            detail="Email, storage, address lookup, iD30 Auth, OpenAI and marketing platform connections."
          />
          <QuickLinkCard
            href="/telephony/system"
            icon={Phone}
            title="Phone setup"
            detail="Business hours, call routing, queues, users and phone numbers."
          />
        </section>
      </div>
    </>
  );
}

function SetupGroupCard({ group }: { group: SetupGroup }) {
  const Icon = setupIconMap[group.iconKey];
  const groupStatus = completionStatus(group.items);

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white/90">
              {group.title}
            </h2>
            <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
              {group.description}
            </p>
          </div>
        </div>
        <StatusBadge>{setupStatusLabel(groupStatus)}</StatusBadge>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {group.items.map((item) => (
          <div
            key={`${group.title}-${item.title}`}
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white/90">
                  {item.title}
                </h3>
                <StatusBadge>{setupStatusLabel(item.status)}</StatusBadge>
              </div>
              <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
                {item.detail}
              </p>
            </div>
            <Link
              href={item.href}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-theme-xs transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              {item.action}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        ))}
      </div>
    </article>
  );
}

function QuickLinkCard({
  detail,
  href,
  icon: Icon,
  title,
}: {
  detail: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs transition hover:border-brand-200 hover:shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-900/60"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/10 dark:text-brand-300">
          <Icon className="size-5" />
        </span>
        <ArrowRight className="mt-2 size-4 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white/90">
        {title}
      </h3>
      <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">
        {detail}
      </p>
    </Link>
  );
}

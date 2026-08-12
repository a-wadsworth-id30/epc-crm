import Link from "next/link";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import CallTrackingPoolManagerLoader from "@/components/crm-boilerplate/CallTrackingPoolManagerLoader";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import StatusBadge from "@/components/crm-boilerplate/StatusBadge";
import CallTrackingTabs from "@/components/crm-boilerplate/telephony-pages/CallTrackingTabs";
import { twilioProvider, twilioStoredConfigSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";

function appBaseUrl() {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm.id30.com"
  ).replace(/\/$/, "");
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export default async function CallTrackingSettingsPage() {
  const [numbers, activeAssignments, attributionRecords, twilioConnection] =
    await Promise.all([
      prisma.attributionPhoneNumber.findMany({
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        take: 50,
        include: {
          _count: {
            select: {
              assignments: {
                where: { expiresAt: { gt: new Date() } },
              },
              records: true,
            },
          },
        },
      }),
      prisma.attributionNumberAssignment.count({
        where: { expiresAt: { gt: new Date() } },
      }),
      prisma.attributionRecord.count(),
      prisma.integrationConnection.findUnique({ where: { provider: twilioProvider } }),
    ]);
  const twilio = twilioStoredConfigSchema.safeParse(twilioConnection?.config ?? {});
  const twilioConfig = twilio.success ? twilio.data : null;
  const twilioReady = Boolean(
    twilioConfig?.credentials?.authToken &&
      twilioConfig.capabilities.includes("voice") &&
      twilioConfig.webhookBaseUrl,
  );
  const baseUrl = appBaseUrl();
  const script = `<script src="${baseUrl}/attribution.js" data-id30-attribution defer></script>`;
  const activeNumbers = numbers.filter((number) => number.isActive).length;
  const numberPool = numbers.map((number) => ({
    id: number.id,
    phoneNumber: number.phoneNumber,
    label: number.label,
    destinationNumber: number.destinationNumber,
    isActive: number.isActive,
    priority: number.priority,
    metadata: number.metadata,
    createdAt: number.createdAt.toISOString(),
    assignments: number._count.assignments,
    records: number._count.records,
  }));
  const trackingPoolLabels = new Set(numberPool.map((number) => number.label || "__unlabelled__"));
  const activeTrackingPoolLabels = new Set(
    numberPool
      .filter((number) => number.isActive)
      .map((number) => number.label || "__unlabelled__"),
  );
  const releasedNumbers = numberPool.filter(
    (number) => asRecord(number.metadata).releasedFromTwilio === true,
  ).length;
  const inactiveNumbers = numberPool.length - activeNumbers;
  const importedInventory = twilioConfig?.importedInventory ?? null;
  const importedAddresses =
    importedInventory?.addresses.map((address) => {
      const record = asRecord(address);

      return {
        sid: stringValue(record.sid) ?? "",
        label: stringValue(record.label) ?? stringValue(record.customerName) ?? "Twilio address",
        country: stringValue(record.country),
        city: stringValue(record.city),
        region: stringValue(record.region),
      };
    }).filter((address) => address.sid) ?? [];
  const importedBundles =
    importedInventory?.bundles.map((bundle) => {
      const record = asRecord(bundle);

      return {
        sid: stringValue(record.sid) ?? "",
        label: stringValue(record.label) ?? "Twilio bundle",
        country: stringValue(record.country),
        numberType: stringValue(record.numberType),
        status: stringValue(record.status),
      };
    }).filter((bundle) => bundle.sid) ?? [];

  return (
    <>
      <PageHeader
        title="Call tracking"
        description="Track which marketing source generated each call without changing how your team answers."
        actions={
          <Link
            href="/marketing"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            View marketing performance
          </Link>
        }
      />

      <CallTrackingTabs activeHref="/telephony/call-tracking/overview" />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Twilio"
          value={twilioConfig ? "Connected" : "Needed"}
          detail="Used to buy and route tracking numbers"
          help="Twilio provides the phone numbers and webhooks used to route tracked calls into the CRM."
        />
        <Metric
          label="Tracking pools"
          value={trackingPoolLabels.size.toString()}
          detail={`${activeTrackingPoolLabels.size} active / ${numberPool.length} total numbers`}
          help="Pools are groups of numbers the website can rotate between visitors for dynamic number insertion."
        />
        <Metric
          label="Tracking numbers"
          value={activeNumbers.toString()}
          detail={`${inactiveNumbers} inactive / ${releasedNumbers} released`}
          help="Active tracking numbers can be assigned to visitors; released numbers are kept only for history."
        />
        <Metric
          label="Live assignments"
          value={activeAssignments.toString()}
          detail="Current visitor/session number leases"
          help="A live assignment means a visitor session currently owns a tracking number lease."
        />
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)] xl:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              Setup flow
            </p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                Configure tracking before reviewing performance
              </h2>
              <LazyHelpTooltip content="Overview shows setup health and links to operational call tracking tools; campaign performance stays in Marketing." />
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              The Marketing page should show cost and lead performance. This page is only for setup.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SetupStatus title="Script" detail="CRM-managed website tag" ready />
            <SetupStatus title="Twilio" detail="Voice-capable account" ready={twilioReady} />
            <SetupStatus title="Number pool" detail="Numbers available to swap" ready={activeNumbers > 0} />
            <SetupStatus title="Performance" detail="Review on Marketing page" ready={attributionRecords > 0} />
          </div>
        </div>
      </section>

      <CallTrackingPoolManagerLoader
        importedAddresses={importedAddresses}
        importedAt={importedInventory?.lastImportedAt ?? null}
        importedBundles={importedBundles}
        numberPool={numberPool}
        twilioReady={twilioReady}
      />

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  Website script
                </h2>
                <LazyHelpTooltip content="Shows the website tag that powers visitor attribution, automatic form capture and dynamic number insertion." />
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                One CRM-managed script handles attribution, form capture and automatic phone number swapping.
              </p>
            </div>
            <StatusBadge>Required</StatusBadge>
          </div>
          <pre className="mt-4 max-w-full overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">
            <code>{script}</code>
          </pre>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SetupStep title="1. Install script" detail="Add once to the website or Google Tag Manager." />
            <SetupStep title="2. Add pool numbers" detail="Buy or import Twilio numbers for dynamic insertion." />
            <SetupStep title="3. Review results" detail="Calls and forms feed the Marketing page." />
          </div>
        </section>

        <section className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Call tracking controls
            </h2>
            <LazyHelpTooltip content="Use these sections when you need to configure numbers, rules, diagnostics or end-to-end validation." />
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Use the dedicated routes when you need to tune routing, inspect numbers or diagnose tracking.
          </p>
          <div className="mt-4 space-y-3">
            <ControlLink
              detail="Create pools and edit routing labels for groups of tracking numbers."
              href="/telephony/call-tracking/pools"
              title="Number pools"
            />
            <ControlLink
              detail="Review active, inactive and released Twilio inventory."
              href="/telephony/call-tracking/numbers"
              title="Tracking numbers"
            />
            <ControlLink
              detail="Route visitors to specific pools by source, campaign, referrer or page."
              href="/telephony/call-tracking/dni-rules"
              title="DNI rules"
            />
            <ControlLink
              detail="Check script health, domains, sessions, assignments and recent logs."
              href="/telephony/call-tracking/diagnostics"
              title="Diagnostics"
            />
            <ControlLink
              detail="Run the script, config, DNI, number assignment and visitor-log checklist."
              href="/telephony/call-tracking/validation"
              title="Validation"
            />
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
              {attributionRecords} attribution record{attributionRecords === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Visitor and conversion detail remains in Marketing so setup screens stay operational.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function ControlLink({
  detail,
  href,
  title,
}: {
  detail: string;
  href: string;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-gray-200 p-3 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-gray-800 dark:hover:border-brand-900/60 dark:hover:bg-brand-900/10"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
        <span className="text-sm text-gray-400">View</span>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </Link>
  );
}

function Metric({
  detail,
  help,
  label,
  value,
}: {
  detail: string;
  help?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {help && <LazyHelpTooltip content={help} />}
      </div>
      <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function SetupStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function SetupStatus({
  detail,
  ready,
  title,
}: {
  detail: string;
  ready: boolean;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${ready ? "bg-success-500" : "bg-warning-500"}`} />
        <p className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

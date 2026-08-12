import Link from "next/link";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import CallTrackingPoolManagerLoader from "@/components/crm-boilerplate/CallTrackingPoolManagerLoader";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import CallTrackingTabs from "@/components/crm-boilerplate/telephony-pages/CallTrackingTabs";
import { twilioProvider, twilioStoredConfigSchema } from "@/lib/integrations/twilio";
import { prisma } from "@/lib/prisma";

type CallTrackingInventoryMode = "pools" | "numbers";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

export default async function CallTrackingInventoryPage({
  mode,
}: {
  mode: CallTrackingInventoryMode;
}) {
  const [numbers, twilioConnection] = await Promise.all([
    prisma.attributionPhoneNumber.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      take: 100,
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
    prisma.integrationConnection.findUnique({ where: { provider: twilioProvider } }),
  ]);
  const twilio = twilioStoredConfigSchema.safeParse(twilioConnection?.config ?? {});
  const twilioConfig = twilio.success ? twilio.data : null;
  const twilioReady = Boolean(
    twilioConfig?.credentials?.authToken &&
      twilioConfig.capabilities.includes("voice") &&
      twilioConfig.webhookBaseUrl,
  );
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
  const activeNumbers = numberPool.filter((number) => number.isActive).length;
  const inactiveNumbers = numberPool.length - activeNumbers;
  const releasedNumbers = numberPool.filter(
    (number) => asRecord(number.metadata).releasedFromTwilio === true,
  ).length;
  const activePoolLabels = new Set(
    numberPool
      .filter((number) => number.isActive)
      .map((number) => number.label || "__unlabelled__"),
  );
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
  const isPoolsMode = mode === "pools";

  return (
    <>
      <PageHeader
        title={isPoolsMode ? "Number pools" : "Tracking numbers"}
        description={
          isPoolsMode
            ? "Create and tune the grouped Twilio number pools used by website DNI."
            : "Review active, inactive, imported and released tracking number inventory."
        }
        actions={
          <Link
            href="/telephony/call-tracking/overview"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            Back to overview
          </Link>
        }
      />

      <CallTrackingTabs activeHref={`/telephony/call-tracking/${mode}`} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={isPoolsMode ? "Active pools" : "Active numbers"}
          value={isPoolsMode ? activePoolLabels.size.toString() : activeNumbers.toString()}
          detail={
            isPoolsMode
              ? `${activeNumbers} active tracking numbers`
              : `${numberPool.length} total tracking numbers`
          }
          help={
            isPoolsMode
              ? "An active pool has at least one active number available for DNI assignment."
              : "Active numbers are available for visitor/session assignment."
          }
        />
        <Metric
          label={isPoolsMode ? "Total numbers" : "Inactive numbers"}
          value={isPoolsMode ? numberPool.length.toString() : inactiveNumbers.toString()}
          detail={isPoolsMode ? `${inactiveNumbers} inactive` : "Can be reactivated or released"}
          help={
            isPoolsMode
              ? "Total numbers includes active, inactive and released tracking inventory."
              : "Inactive numbers are not assigned to visitors until reactivated."
          }
        />
        <Metric
          label={isPoolsMode ? "Assignments" : "Released"}
          value={
            isPoolsMode
              ? numberPool.reduce((total, number) => total + number.assignments, 0).toString()
              : releasedNumbers.toString()
          }
          detail={isPoolsMode ? "Current visitor/session leases" : "Retained for history only"}
          help={
            isPoolsMode
              ? "Assignments are active visitor/session leases created when the website asks for a tracking number."
              : "Released numbers are no longer owned in Twilio but remain visible for reporting history."
          }
        />
        <Metric
          label="Twilio"
          value={twilioReady ? "Ready" : "Needed"}
          detail="Voice credentials and webhook setup"
          help="Twilio must be ready before the CRM can buy, import or release phone numbers."
        />
      </div>

      <CallTrackingPoolManagerLoader
        importedAddresses={importedAddresses}
        importedAt={importedInventory?.lastImportedAt ?? null}
        importedBundles={importedBundles}
        mode={mode}
        numberPool={numberPool}
        twilioReady={twilioReady}
      />
    </>
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

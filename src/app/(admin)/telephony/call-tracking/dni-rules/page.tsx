import type { Metadata } from "next";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import LazyDniRulesPanel from "@/components/crm-boilerplate/LazyDniRulesPanel";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import CallTrackingTabs from "@/components/crm-boilerplate/telephony-pages/CallTrackingTabs";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "DNI Rules | iD30 CRM",
};

type DniRuleDelegate = {
  findMany: (args: {
    orderBy: Array<Record<string, "asc" | "desc">>;
  }) => Promise<
    Array<{
      id: string;
      name: string;
      description: string | null;
      matchField: string;
      matchOperator: string;
      matchValue: string | null;
      poolLabel: string | null;
      fallbackNumber: string | null;
      priority: number;
      isActive: boolean;
      isDefault: boolean;
      notes: string | null;
      updatedAt: Date;
    }>
  >;
};

export default async function TelephonyCallTrackingDniRulesPage() {
  await requireAdmin();

  const dniRuleDelegate = (prisma as unknown as { attributionDniRule?: DniRuleDelegate })
    .attributionDniRule;

  if (!dniRuleDelegate) {
    return (
      <>
        <PageHeader
          title="DNI Rules"
          description="Route visitors into the right dynamic number pool based on source, campaign, referrer or landing page."
        />
        <CallTrackingTabs activeHref="/telephony/call-tracking/dni-rules" />
        <DniRulesUnavailableNotice />
      </>
    );
  }

  const [rules, numbers] = await Promise.all([
    dniRuleDelegate.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.attributionPhoneNumber.findMany({
      where: { isActive: true, label: { not: null } },
      select: { label: true },
      orderBy: { label: "asc" },
    }),
  ]);
  const poolLabels = Array.from(
    new Set(numbers.map((number) => number.label).filter((label): label is string => Boolean(label))),
  );

  return (
    <>
      <PageHeader
        title="DNI Rules"
        description="Route visitors into the right dynamic number pool based on source, campaign, referrer or landing page."
      />
      <CallTrackingTabs activeHref="/telephony/call-tracking/dni-rules" />
      <LazyDniRulesPanel
        poolLabels={poolLabels}
        rules={rules.map((rule) => ({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          matchField: rule.matchField,
          matchOperator: rule.matchOperator,
          matchValue: rule.matchValue,
          poolLabel: rule.poolLabel,
          fallbackNumber: rule.fallbackNumber,
          priority: rule.priority,
          isActive: rule.isActive,
          isDefault: rule.isDefault,
          notes: rule.notes,
          updatedAt: rule.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}

function DniRulesUnavailableNotice() {
  return (
    <section className="rounded-2xl border border-warning-200 bg-warning-50 p-5 shadow-theme-xs dark:border-warning-900/40 dark:bg-warning-900/20">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-warning-800 dark:text-warning-200">
          DNI rules are not available in this running app process
        </h2>
        <LazyHelpTooltip content="Explains why DNI rule editing is disabled and what environment step is needed before this section can be used." />
      </div>
      <p className="mt-2 text-sm text-warning-700 dark:text-warning-300">
        Regenerate the Prisma client and restart the Next.js server before adding or editing DNI
        rules. If this is production, run the production Prisma migrations as part of the deploy.
      </p>
      <div className="mt-4 rounded-xl border border-warning-200 bg-white/70 p-3 text-xs text-warning-800 dark:border-warning-900/40 dark:bg-gray-950/30 dark:text-warning-200">
        Local fix: stop the dev server, run npm run db:generate, then start npm run dev again.
      </div>
    </section>
  );
}

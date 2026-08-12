import type { Metadata } from "next";
import Link from "next/link";
import LazyOfflineCampaignsPanel from "@/components/crm-boilerplate/LazyOfflineCampaignsPanel";
import { MarketingSectionTabs } from "@/components/crm-boilerplate/MarketingRouteShell";
import MetricCard from "@/components/crm-boilerplate/MetricCard";
import type {
  OfflineCampaignRow,
  OfflineTrackingNumberRow,
} from "@/components/crm-boilerplate/OfflineCampaignsPanel";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Offline Campaigns | iD30 CRM",
  description: "Offline campaign setup, source fields, dates and cost metadata.",
};

export default async function OfflineCampaignsPage() {
  await requireAdmin();
  const campaignRegistry = await loadOfflineCampaigns();
  const activeCampaigns = campaignRegistry.campaigns.filter(
    (campaign) => campaign.status === "ACTIVE",
  ).length;
  const totalBudgetCents = campaignRegistry.campaigns.reduce(
    (total, campaign) => total + (campaign.budgetCents ?? 0),
    0,
  );
  const linkedRecords = campaignRegistry.campaigns.reduce(
    (total, campaign) => total + campaign.attributionRecordsCount,
    0,
  );

  return (
    <>
      <PageHeader
        title="Offline Campaigns"
        description="Set up offline campaign metadata for reporting, QR and call-tracking workflows."
        actions={
          <Link
            href="/marketing/offline-media"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.06]"
          >
            Offline report
          </Link>
        }
      />
      <MarketingSectionTabs
        activeRange="30d"
        activeSection="offline-campaigns"
      />
      <div className="mt-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Campaigns"
            labelVariant="uppercase"
            value={campaignRegistry.campaigns.length.toString()}
          />
          <MetricCard
            label="Active"
            labelVariant="uppercase"
            value={activeCampaigns.toString()}
          />
          <MetricCard
            label="Planned spend"
            labelVariant="uppercase"
            value={formatMoney(totalBudgetCents, "GBP")}
          />
          <MetricCard
            label="Linked conversions"
            labelVariant="uppercase"
            value={linkedRecords.toString()}
          />
        </div>
        <LazyOfflineCampaignsPanel
          campaigns={campaignRegistry.campaigns}
          trackingNumbers={campaignRegistry.trackingNumbers}
          unavailable={campaignRegistry.unavailable}
        />
      </div>
    </>
  );
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value / 100);
}

async function loadOfflineCampaigns(): Promise<{
  campaigns: OfflineCampaignRow[];
  trackingNumbers: OfflineTrackingNumberRow[];
  unavailable: boolean;
}> {
  try {
    const [campaigns, trackingNumbers] = await Promise.all([
      prisma.offlineCampaign.findMany({
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        select: {
          actualCostCents: true,
          budgetCents: true,
          campaign: true,
          channel: true,
          code: true,
          content: true,
          createdAt: true,
          currency: true,
          destinationUrl: true,
          endDate: true,
          id: true,
          medium: true,
          name: true,
          notes: true,
          source: true,
          startDate: true,
          status: true,
          term: true,
          updatedAt: true,
          _count: {
            select: {
              trackingNumbers: true,
              attributionRecords: true,
              touchpoints: true,
            },
          },
        },
      }),
      prisma.attributionPhoneNumber.findMany({
        orderBy: [
          { isActive: "desc" },
          { priority: "asc" },
          { phoneNumber: "asc" },
        ],
        select: {
          id: true,
          phoneNumber: true,
          label: true,
          destinationNumber: true,
          isActive: true,
          priority: true,
          offlineCampaignId: true,
        },
      }),
    ]);

    return {
      campaigns: campaigns.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        code: campaign.code,
        channel: campaign.channel,
        status: campaign.status,
        source: campaign.source,
        medium: campaign.medium,
        campaign: campaign.campaign,
        content: campaign.content,
        term: campaign.term,
        destinationUrl: campaign.destinationUrl,
        startDate: campaign.startDate?.toISOString() ?? null,
        endDate: campaign.endDate?.toISOString() ?? null,
        budgetCents: campaign.budgetCents,
        actualCostCents: campaign.actualCostCents,
        currency: campaign.currency,
        notes: campaign.notes,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
        trackingNumbersCount: campaign._count.trackingNumbers,
        attributionRecordsCount: campaign._count.attributionRecords,
        touchpointsCount: campaign._count.touchpoints,
      })),
      trackingNumbers,
      unavailable: false,
    };
  } catch (error) {
    if (!isMissingOfflineCampaignSchema(error)) throw error;

    return { campaigns: [], trackingNumbers: [], unavailable: true };
  }
}

function isMissingOfflineCampaignSchema(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "OfflineCampaign" ||
        candidate.meta?.table?.includes("OfflineCampaign"))) ||
    (candidate.code === "P2022" &&
      (candidate.meta?.modelName === "OfflineCampaign" ||
        candidate.meta?.table?.includes("OfflineCampaign")))
  );
}

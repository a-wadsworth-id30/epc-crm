import type { Metadata } from "next";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import LazyReportsWorkspace from "@/components/reports/LazyReportsWorkspace";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  defaultReportPlans,
  reportDatasets,
  sanitiseReportPlan,
} from "@/lib/reports/engine";

export const metadata: Metadata = {
  title: "Reports | iD30 CRM",
};

export default async function ReportsPage() {
  const user = await requireUser();
  const savedReports = await prisma.reportDefinition.findMany({
    where: {
      OR: [
        { visibility: "GLOBAL" },
        { visibility: "TEAM" },
        { ownerId: user.id },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      description: true,
      visibility: true,
      source: true,
      config: true,
      updatedAt: true,
    },
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description="Build consistent CRM reports with saved views, charts, tables and Sidekick-generated analysis."
      />
      <LazyReportsWorkspace
        datasets={reportDatasets}
        defaultPlans={defaultReportPlans}
        savedReports={savedReports.map((report) => ({
          ...report,
          config: sanitiseReportPlan(report.config),
          updatedAt: report.updatedAt.toISOString(),
        }))}
      />
    </>
  );
}

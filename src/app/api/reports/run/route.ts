import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runReportPlan, sanitiseReportPlan } from "@/lib/reports/engine";

export async function POST(request: Request) {
  const user = await requireUser();
  try {
    const payload = (await request.json().catch(() => null)) as {
      plan?: unknown;
      reportDefinitionId?: string;
    } | null;

    let plan = payload?.plan ? sanitiseReportPlan(payload.plan) : null;
    const reportDefinitionId = payload?.reportDefinitionId?.trim() || null;

    if (reportDefinitionId) {
      const report = await prisma.reportDefinition.findFirst({
        where: {
          id: reportDefinitionId,
          OR: [
            { visibility: "GLOBAL" },
            { visibility: "TEAM" },
            { ownerId: user.id },
          ],
        },
        select: { config: true },
      });

      if (!report) {
        return NextResponse.json({ error: "Report not found." }, { status: 404 });
      }

      plan = sanitiseReportPlan(report.config);
    }

    if (!plan) {
      return NextResponse.json(
        { error: "Report plan is required." },
        { status: 400 },
      );
    }

    const result = await runReportPlan({
      reportDefinitionId,
      user,
      plan,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Report run failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Report could not be run.",
      },
      { status: 500 },
    );
  }
}

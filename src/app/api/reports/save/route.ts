import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sanitiseReportPlan } from "@/lib/reports/engine";

export async function POST(request: Request) {
  const user = await requireUser();
  try {
    const payload = (await request.json().catch(() => null)) as {
      title?: string;
      description?: string;
      visibility?: string;
      plan?: unknown;
    } | null;
    const plan = sanitiseReportPlan(payload?.plan);
    const title = payload?.title?.trim() || plan.title || "Custom report";
    const visibility =
      user.role === "ADMIN" &&
      (payload?.visibility === "GLOBAL" || payload?.visibility === "TEAM")
        ? payload.visibility
        : "PRIVATE";

    const report = await prisma.reportDefinition.create({
      data: {
        config: plan as unknown as Prisma.InputJsonObject,
        description: payload?.description?.trim() || null,
        ownerId: user.id,
        source: "CUSTOM",
        title,
        visibility,
      },
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

    return NextResponse.json({
      ...report,
      updatedAt: report.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Report save failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Report could not be saved.",
      },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { applySidekickDiscoveryPackPlan } from "@/lib/ai/sidekick-discovery-plans";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_: Request, context: RouteContext) {
  const [user, params] = await Promise.all([requireAdmin(), context.params]);

  try {
    const result = await applySidekickDiscoveryPackPlan({
      planId: params.id,
      user,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not apply the Sidekick write plan.",
      },
      { status: 400 },
    );
  }
}

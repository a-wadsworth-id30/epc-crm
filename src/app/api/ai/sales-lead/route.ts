import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  runSalesLeadAssistant,
  salesLeadAssistantRequestSchema,
} from "@/lib/ai/sales-lead-assistant";

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = await request.json().catch(() => null);
  const parsed = salesLeadAssistantRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Select a valid lead and channel for Sales AI." },
      { status: 400 },
    );
  }

  try {
    const result = await runSalesLeadAssistant(user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Sale not found"
        ? "Lead not found or unavailable."
        : "Sales AI could not generate guidance for this lead.";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  contactAssistantRequestSchema,
  runContactAssistant,
} from "@/lib/ai/contact-assistant";

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = await request.json().catch(() => null);
  const parsed = contactAssistantRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Select a valid contact and response channel." },
      { status: 400 },
    );
  }

  try {
    const result = await runContactAssistant(user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error && error.message === "Contact not found"
        ? "Contact not found or unavailable."
        : "Contact AI could not generate guidance for this customer.";

    return NextResponse.json({ error: message }, { status: 404 });
  }
}

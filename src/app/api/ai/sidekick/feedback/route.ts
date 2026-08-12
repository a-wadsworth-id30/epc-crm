import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const sidekickFeedbackSchema = z.object({
  answerMode: z.enum(["openai", "fallback", "blocked"]).optional(),
  answerPreview: z.string().max(1000).optional(),
  messageId: z.string().max(160).optional(),
  model: z.string().max(120).optional().nullable(),
  pagePath: z.string().max(500).optional().nullable(),
  promptPreview: z.string().max(500).optional(),
  rating: z.enum(["positive", "negative"]),
  report: z
    .object({
      dataset: z.string().max(120).optional().nullable(),
      permissionScope: z.string().max(120).optional().nullable(),
      planner: z.string().max(80).optional().nullable(),
      rowCount: z.number().int().min(0).max(100000).optional().nullable(),
      title: z.string().max(240).optional().nullable(),
    })
    .optional()
    .nullable(),
  tools: z.array(z.string().max(120)).max(8).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  const payload = await request.json().catch(() => null);
  const parsed = sidekickFeedbackSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Sidekick feedback could not be recorded." },
      { status: 400 },
    );
  }

  const data = parsed.data;

  await prisma.auditLog.create({
    data: {
      action: "ai.sidekick.feedback",
      actorId: user.id,
      entity: "AiSidekick",
      entityId: data.messageId ?? null,
      metadata: {
        answerMode: data.answerMode ?? null,
        answerPreview: data.answerPreview ?? null,
        model: data.model ?? null,
        pagePath: data.pagePath ?? null,
        promptPreview: data.promptPreview ?? null,
        rating: data.rating,
        report: data.report ?? null,
        tools: data.tools ?? [],
      } satisfies Prisma.InputJsonObject,
    },
  });

  return NextResponse.json({ ok: true });
}

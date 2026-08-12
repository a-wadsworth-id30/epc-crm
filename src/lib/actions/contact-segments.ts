"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  buildContactSegmentDraft,
  contactSegmentCriteriaSchema,
  countContactsForSegment,
  parseContactSegmentCriteria,
} from "@/lib/contact-segments";
import { prisma } from "@/lib/prisma";

export type SegmentActionState = {
  ok: boolean;
  message: string;
};

export type SegmentBuilderState = SegmentActionState & {
  draft: {
    name: string;
    description: string | null;
    summary: string;
    criteriaJson: string;
    prompt: string;
    matchCount: number;
    mode: "fallback" | "openai";
    note?: string | null;
  } | null;
};

const segmentInputSchema = z.object({
  name: z.string().trim().min(1, "Name the segment.").max(80),
  description: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  prompt: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  aiSummary: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || null),
  criteriaJson: z.string().min(1, "Generate or define segment criteria first."),
});

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseCriteriaJson(value: string) {
  try {
    return contactSegmentCriteriaSchema.safeParse(JSON.parse(value));
  } catch {
    return contactSegmentCriteriaSchema.safeParse(null);
  }
}

export async function generateContactSegmentAction(
  _: SegmentBuilderState,
  formData: FormData,
): Promise<SegmentBuilderState> {
  const user = await requireUser();

  const prompt = stringValue(formData, "prompt").trim();

  try {
    const draft = await buildContactSegmentDraft(prompt, user);

    return {
      ok: true,
      message:
        draft.mode === "openai"
          ? "Segment criteria drafted with AI."
          : "Segment criteria drafted with fallback rules.",
      draft: {
        name: draft.name,
        description: draft.description ?? null,
        summary: draft.summary,
        criteriaJson: JSON.stringify(draft.criteria),
        prompt,
        matchCount: draft.matchCount,
        mode: draft.mode,
        note: draft.note ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to build this segment.",
      draft: null,
    };
  }
}

export async function createContactSegmentAction(
  _: SegmentActionState,
  formData: FormData,
): Promise<SegmentActionState> {
  const user = await requireUser();
  const parsed = segmentInputSchema.safeParse({
    name: stringValue(formData, "name"),
    description: stringValue(formData, "description"),
    prompt: stringValue(formData, "prompt"),
    aiSummary: stringValue(formData, "aiSummary"),
    criteriaJson: stringValue(formData, "criteriaJson"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the segment details.",
    };
  }

  const criteria = parseCriteriaJson(parsed.data.criteriaJson);

  if (!criteria.success) {
    return {
      ok: false,
      message: "The segment criteria are not supported.",
    };
  }

  const matchCount = await countContactsForSegment(criteria.data, user);

  await prisma.contactSegment.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      audience: "PEOPLE",
      prompt: parsed.data.prompt,
      criteria: criteria.data,
      aiSummary: parsed.data.aiSummary,
      matchCount,
      lastEvaluatedAt: new Date(),
      createdByUserId: user.id,
    },
  });

  revalidatePath("/contacts/segments");

  return {
    ok: true,
    message: `Segment saved with ${matchCount} matching ${matchCount === 1 ? "person" : "people"}.`,
  };
}

export async function refreshContactSegmentAction(formData: FormData) {
  const user = await requireUser();
  const id = stringValue(formData, "id");
  const segment = await prisma.contactSegment.findUnique({
    where: { id },
    select: { id: true, criteria: true, createdByUserId: true },
  });

  if (!segment) {
    return;
  }

  if (user.role !== "ADMIN" && segment.createdByUserId !== user.id) {
    return;
  }

  const criteria = parseContactSegmentCriteria(segment.criteria);

  if (!criteria.success) {
    return;
  }

  const matchCount = await countContactsForSegment(criteria.data, user);

  await prisma.contactSegment.update({
    where: { id: segment.id },
    data: { matchCount, lastEvaluatedAt: new Date() },
  });

  revalidatePath("/contacts/segments");
  revalidatePath(`/contacts/segments/${segment.id}`);
}

export async function deleteContactSegmentAction(formData: FormData) {
  const user = await requireUser();
  const id = stringValue(formData, "id");

  if (!id) {
    return;
  }

  await prisma.contactSegment
    .deleteMany({
      where: {
        id,
        ...(user.role === "ADMIN" ? {} : { createdByUserId: user.id }),
      },
    })
    .catch(() => null);

  revalidatePath("/contacts/segments");
}

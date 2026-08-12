"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AttributionRuleActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const ruleTypes = ["source-override", "channel-group", "campaign-normalisation"] as const;
const matchFields = [
  "submittedSource",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer",
  "landingPage",
  "currentPage",
] as const;
const matchOperators = ["contains", "equals", "starts-with"] as const;

const createRuleSchema = z.object({
  name: z.string().trim().min(2, "Enter a rule name.").max(120),
  ruleType: z.enum(ruleTypes).catch("source-override"),
  matchField: z.enum(matchFields).catch("utm_source"),
  matchOperator: z.enum(matchOperators).catch("contains"),
  matchValue: z.string().trim().min(1, "Enter a match value.").max(240),
  outputSource: z.string().trim().optional().transform((value) => value || null),
  outputChannel: z.string().trim().optional().transform((value) => value || null),
  outputCampaign: z.string().trim().optional().transform((value) => value || null),
  priority: z.coerce.number().int().min(0).max(999).catch(0),
  notes: z.string().trim().optional().transform((value) => value || null),
});

const removeRuleSchema = z.object({
  id: z.string().trim().min(1),
});
const updateRuleSchema = z.object({
  id: z.string().trim().min(1),
  isActive: z.boolean(),
  priority: z.coerce.number().int().min(0).max(999).catch(0),
  outputSource: z.string().trim().optional().transform((value) => value || null),
});

function unavailableState(): AttributionRuleActionState {
  return {
    ok: false,
    message: "Attribution rules are unavailable until the latest migrations run.",
    savedAt: null,
  };
}

function isMissingAttributionRuleTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionRule" ||
        candidate.meta?.table?.includes("AttributionRule"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionRule")
  );
}

export async function createAttributionRuleAction(
  _: AttributionRuleActionState,
  formData: FormData,
): Promise<AttributionRuleActionState> {
  await requireAdmin();

  const parsed = createRuleSchema.safeParse({
    name: formData.get("name"),
    ruleType: formData.get("ruleType"),
    matchField: formData.get("matchField"),
    matchOperator: formData.get("matchOperator"),
    matchValue: formData.get("matchValue"),
    outputSource: formData.get("outputSource"),
    outputChannel: formData.get("outputChannel"),
    outputCampaign: formData.get("outputCampaign"),
    priority: formData.get("priority"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the rule details.",
      savedAt: null,
    };
  }

  try {
    await prisma.attributionRule.create({ data: parsed.data });
  } catch (error) {
    if (isMissingAttributionRuleTable(error)) {
      return unavailableState();
    }

    throw error;
  }

  revalidatePath("/settings/attribution/attribution-rules");
  return { ok: true, message: "Attribution rule added.", savedAt: Date.now() };
}

export async function removeAttributionRuleAction(
  _: AttributionRuleActionState,
  formData: FormData,
): Promise<AttributionRuleActionState> {
  await requireAdmin();

  const parsed = removeRuleSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return { ok: false, message: "Choose a rule to remove.", savedAt: null };
  }

  try {
    await prisma.attributionRule.delete({ where: { id: parsed.data.id } });
  } catch (error) {
    if (isMissingAttributionRuleTable(error)) {
      return unavailableState();
    }

    throw error;
  }

  revalidatePath("/settings/attribution/attribution-rules");
  return { ok: true, message: "Attribution rule removed.", savedAt: Date.now() };
}

export async function updateAttributionRuleAction(
  _: AttributionRuleActionState,
  formData: FormData,
): Promise<AttributionRuleActionState> {
  await requireAdmin();

  const parsed = updateRuleSchema.safeParse({
    id: formData.get("id"),
    isActive: formData.get("isActive") === "on",
    priority: formData.get("priority"),
    outputSource: formData.get("outputSource"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the rule details.",
      savedAt: null,
    };
  }

  const { id, ...data } = parsed.data;

  try {
    await prisma.attributionRule.update({ where: { id }, data });
  } catch (error) {
    if (isMissingAttributionRuleTable(error)) {
      return unavailableState();
    }

    throw error;
  }

  revalidatePath("/settings/attribution/attribution-rules");
  return { ok: true, message: "Attribution rule updated.", savedAt: Date.now() };
}

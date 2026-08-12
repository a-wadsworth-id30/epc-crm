"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { normalizeCallableNumber } from "@/lib/integrations/twilio-server";
import { prisma } from "@/lib/prisma";

export type DniRuleActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const matchFields = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "referrer",
  "landingPage",
  "currentPage",
] as const;
const matchOperators = ["contains", "equals", "starts-with", "ends-with"] as const;

const dniRuleFormSchema = z
  .object({
    id: z.string().trim().optional(),
    name: z.string().trim().min(2, "Enter a rule name.").max(120),
    description: z.string().trim().optional().transform((value) => value || null),
    matchField: z.enum(matchFields).catch("utm_source"),
    matchOperator: z.enum(matchOperators).catch("contains"),
    matchValue: z.string().trim().optional().transform((value) => value || null),
    poolLabel: z.string().trim().optional().transform((value) => value || null),
    fallbackNumber: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? normalizeCallableNumber(value) : null)),
    priority: z.coerce.number().int().min(0).max(999).catch(0),
    isActive: z.boolean(),
    isDefault: z.boolean(),
    notes: z.string().trim().optional().transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (!value.isDefault && !value.matchValue) {
      context.addIssue({
        code: "custom",
        message: "Enter a match value, or mark this as the default rule.",
        path: ["matchValue"],
      });
    }

    if (!value.poolLabel && !value.fallbackNumber) {
      context.addIssue({
        code: "custom",
        message: "Choose a tracking pool or enter a fallback number.",
        path: ["poolLabel"],
      });
    }
  });

const removeRuleSchema = z.object({
  id: z.string().trim().min(1),
});

function state(message: string, ok = false): DniRuleActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function parseRuleForm(formData: FormData) {
  return dniRuleFormSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description"),
    matchField: formData.get("matchField"),
    matchOperator: formData.get("matchOperator"),
    matchValue: formData.get("matchValue"),
    poolLabel: formData.get("poolLabel"),
    fallbackNumber: formData.get("fallbackNumber"),
    priority: formData.get("priority"),
    isActive: formData.get("isActive") === "on",
    isDefault: formData.get("isDefault") === "on",
    notes: formData.get("notes"),
  });
}

function revalidateDniRules() {
  revalidatePath("/telephony/call-tracking");
  revalidatePath("/telephony/call-tracking/overview");
  revalidatePath("/telephony/call-tracking/dni-rules");
}

export async function createDniRuleAction(
  _: DniRuleActionState,
  formData: FormData,
): Promise<DniRuleActionState> {
  await requireAdmin();

  const parsed = parseRuleForm(formData);

  if (!parsed.success) {
    return state(parsed.error.issues[0]?.message ?? "Check the DNI rule details.");
  }

  const data = { ...parsed.data };
  delete data.id;
  await prisma.attributionDniRule.create({ data });
  revalidateDniRules();

  return state("DNI rule added.", true);
}

export async function updateDniRuleAction(
  _: DniRuleActionState,
  formData: FormData,
): Promise<DniRuleActionState> {
  await requireAdmin();

  const parsed = parseRuleForm(formData);

  if (!parsed.success || !parsed.data.id) {
    return state(parsed.success ? "Choose a DNI rule to update." : parsed.error.issues[0]?.message ?? "Check the DNI rule details.");
  }

  const { id, ...data } = parsed.data;
  await prisma.attributionDniRule.update({ where: { id }, data });
  revalidateDniRules();

  return state("DNI rule updated.", true);
}

export async function removeDniRuleAction(
  _: DniRuleActionState,
  formData: FormData,
): Promise<DniRuleActionState> {
  await requireAdmin();

  const parsed = removeRuleSchema.safeParse({ id: formData.get("id") });

  if (!parsed.success) {
    return state("Choose a DNI rule to remove.");
  }

  await prisma.attributionDniRule.delete({ where: { id: parsed.data.id } });
  revalidateDniRules();

  return state("DNI rule removed.", true);
}

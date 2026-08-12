"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  offlineCampaignChannels,
  offlineCampaignStatuses,
} from "@/lib/marketing/offline-campaigns";
import { prisma } from "@/lib/prisma";

export type OfflineCampaignActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const formString = z.preprocess(
  (value) => (typeof value === "string" ? value : ""),
  z.string(),
);

const optionalText = formString.transform((value) => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
});

const requiredText = (message: string, max = 180) =>
  formString
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message).max(max));

const campaignCode = formString
  .transform((value) => normaliseCampaignCode(value))
  .pipe(z.string().min(2, "Enter a campaign code.").max(80));

const moneyField = formString.transform((value, context): number | null => {
  const cleaned = value.replace(/[£,\s]/g, "").trim();

  if (!cleaned) return null;

  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount < 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid non-negative amount.",
    });
    return z.NEVER;
  }

  return Math.round(amount * 100);
});

const dateField = formString.transform((value, context): Date | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a valid date.",
    });
    return z.NEVER;
  }

  return date;
});

const urlField = optionalText.refine(
  (value) => value === null || isValidUrl(value),
  "Enter a valid destination URL.",
);

const offlineCampaignFormSchema = z
  .object({
    id: optionalText,
    name: requiredText("Enter a campaign name."),
    code: campaignCode,
    channel: z.enum(offlineCampaignChannels).catch("OTHER"),
    status: z.enum(offlineCampaignStatuses).catch("DRAFT"),
    source: requiredText("Enter a source."),
    medium: formString.transform((value) => value.trim() || "offline"),
    campaign: requiredText("Enter a campaign value."),
    content: optionalText,
    term: optionalText,
    destinationUrl: urlField,
    startDate: dateField,
    endDate: dateField,
    budgetCents: moneyField,
    actualCostCents: moneyField,
    currency: formString
      .transform((value) => (value.trim() || "GBP").toUpperCase())
      .pipe(z.string().length(3, "Use a 3-letter currency code.")),
    notes: optionalText,
  })
  .superRefine((value, context) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "End date must be on or after the start date.",
      });
    }
  });

const phoneAssignmentSchema = z.object({
  phoneNumberId: requiredText("Choose a tracking number."),
  offlineCampaignId: optionalText,
});

function state(message: string, ok = false): OfflineCampaignActionState {
  return { ok, message, savedAt: ok ? Date.now() : null };
}

function normaliseCampaignCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseCampaignForm(formData: FormData) {
  return offlineCampaignFormSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    code: formData.get("code"),
    channel: formData.get("channel"),
    status: formData.get("status"),
    source: formData.get("source"),
    medium: formData.get("medium"),
    campaign: formData.get("campaign"),
    content: formData.get("content"),
    term: formData.get("term"),
    destinationUrl: formData.get("destinationUrl"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    budgetCents: formData.get("budgetPounds"),
    actualCostCents: formData.get("actualCostPounds"),
    currency: formData.get("currency"),
    notes: formData.get("notes"),
  });
}

function campaignMutationData(value: z.infer<typeof offlineCampaignFormSchema>) {
  return {
    name: value.name,
    code: value.code,
    channel: value.channel,
    status: value.status,
    source: value.source,
    medium: value.medium,
    campaign: value.campaign,
    content: value.content,
    term: value.term,
    destinationUrl: value.destinationUrl,
    startDate: value.startDate,
    endDate: value.endDate,
    budgetCents: value.budgetCents,
    actualCostCents: value.actualCostCents,
    currency: value.currency,
    notes: value.notes,
  };
}

function revalidateOfflineCampaignRoutes() {
  revalidatePath("/marketing");
  revalidatePath("/marketing/offline-media");
  revalidatePath("/marketing/offline-campaigns");
  revalidatePath("/telephony/call-tracking");
  revalidatePath("/telephony/call-tracking/numbers");
  revalidatePath("/telephony/call-tracking/pools");
}

function isMissingOfflineCampaignSchema(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "OfflineCampaign" ||
        candidate.meta?.table?.includes("OfflineCampaign"))) ||
    (candidate.code === "P2022" &&
      (candidate.meta?.modelName === "OfflineCampaign" ||
        candidate.meta?.table?.includes("OfflineCampaign")))
  );
}

function unavailableState(): OfflineCampaignActionState {
  return state(
    "Offline campaign setup is unavailable until the production database migrations have been applied.",
  );
}

export async function createOfflineCampaignAction(
  _: OfflineCampaignActionState,
  formData: FormData,
): Promise<OfflineCampaignActionState> {
  const user = await requireAdmin();
  const parsed = parseCampaignForm(formData);

  if (!parsed.success) {
    return state(parsed.error.issues[0]?.message ?? "Check the campaign details.");
  }

  const data = campaignMutationData(parsed.data);

  try {
    await prisma.offlineCampaign.create({
      data: {
        ...data,
        createdByUserId: user.id,
      },
    });
  } catch (error) {
    const candidate = error as { code?: string };
    if (isMissingOfflineCampaignSchema(error)) return unavailableState();
    if (candidate.code === "P2002") return state("That campaign code already exists.");

    throw error;
  }

  revalidateOfflineCampaignRoutes();
  return state("Offline campaign added.", true);
}

export async function updateOfflineCampaignAction(
  _: OfflineCampaignActionState,
  formData: FormData,
): Promise<OfflineCampaignActionState> {
  await requireAdmin();
  const parsed = parseCampaignForm(formData);

  if (!parsed.success || !parsed.data.id) {
    return state(
      parsed.success
        ? "Choose a campaign to update."
        : parsed.error.issues[0]?.message ?? "Check the campaign details.",
    );
  }

  const data = campaignMutationData(parsed.data);

  try {
    await prisma.offlineCampaign.update({
      where: { id: parsed.data.id },
      data,
    });
  } catch (error) {
    const candidate = error as { code?: string };
    if (isMissingOfflineCampaignSchema(error)) return unavailableState();
    if (candidate.code === "P2002") return state("Another campaign already uses that code.");

    throw error;
  }

  revalidateOfflineCampaignRoutes();
  return state("Offline campaign updated.", true);
}

export async function updateOfflineCampaignPhoneAssignmentAction(
  _: OfflineCampaignActionState,
  formData: FormData,
): Promise<OfflineCampaignActionState> {
  await requireAdmin();

  const parsed = phoneAssignmentSchema.safeParse({
    phoneNumberId: formData.get("phoneNumberId"),
    offlineCampaignId: formData.get("offlineCampaignId"),
  });

  if (!parsed.success) {
    return state(parsed.error.issues[0]?.message ?? "Check the phone assignment.");
  }

  try {
    await prisma.attributionPhoneNumber.update({
      where: { id: parsed.data.phoneNumberId },
      data: { offlineCampaignId: parsed.data.offlineCampaignId },
    });
  } catch (error) {
    const candidate = error as { code?: string };
    if (isMissingOfflineCampaignSchema(error)) return unavailableState();
    if (candidate.code === "P2025") return state("Tracking number was not found.");

    throw error;
  }

  revalidateOfflineCampaignRoutes();
  return state("Phone assignment updated.", true);
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AttributionDomainActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

const environmentValues = ["production", "staging", "development", "microsite"] as const;

const domainSchema = z
  .string()
  .trim()
  .min(3, "Enter a domain.")
  .transform((value) => normaliseDomain(value))
  .refine((value) => value.length >= 3 && !value.includes("/"), "Enter a valid domain.")
  .refine(
    (value) => value === "localhost" || value.includes("."),
    "Enter a domain such as example.com.",
  );

const createDomainSchema = z.object({
  domain: domainSchema,
  label: z.string().trim().optional().transform((value) => value || null),
  environment: z.enum(environmentValues).catch("production"),
  notes: z.string().trim().optional().transform((value) => value || null),
});

const updateDomainSchema = createDomainSchema.extend({
  id: z.string().trim().min(1),
  isActive: z.boolean(),
  trackingEnabled: z.boolean().nullable(),
  consentRequired: z.boolean().nullable(),
  formTrackingEnabled: z.boolean().nullable(),
  phoneTrackingEnabled: z.boolean().nullable(),
  visibleNumberReplacementEnabled: z.boolean().nullable(),
});

const removeDomainSchema = z.object({
  id: z.string().trim().min(1),
});

function normaliseDomain(value: string) {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.toLowerCase().replace(/^www\./, "");
  }
}

function revalidateDomainRoutes() {
  revalidatePath("/settings/attribution/domains");
  revalidatePath("/settings/attribution/tracking-script");
}

function overrideValue(formData: FormData, name: string) {
  const value = formData.get(name);
  if (value === "inherit") return null;
  return value === "on";
}

function isMissingAttributionDomainTable(error: unknown) {
  const candidate = error as {
    code?: string;
    meta?: {
      modelName?: string;
      table?: string;
    };
  };

  return (
    (candidate.code === "P2021" &&
      (candidate.meta?.modelName === "AttributionDomain" ||
        candidate.meta?.table?.includes("AttributionDomain"))) ||
    (candidate.code === "P2022" && candidate.meta?.modelName === "AttributionDomain")
  );
}

function unavailableState(): AttributionDomainActionState {
  return {
    ok: false,
    message:
      "Domain registry is unavailable. Run the production database migrations before changing attribution domains.",
    savedAt: null,
  };
}

export async function createAttributionDomainAction(
  _: AttributionDomainActionState,
  formData: FormData,
): Promise<AttributionDomainActionState> {
  await requireAdmin();

  const parsed = createDomainSchema.safeParse({
    domain: formData.get("domain"),
    label: formData.get("label"),
    environment: formData.get("environment"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the domain details.",
      savedAt: null,
    };
  }

  try {
    await prisma.attributionDomain.create({ data: parsed.data });
  } catch (error) {
    const candidate = error as { code?: string };
    if (isMissingAttributionDomainTable(error)) {
      return unavailableState();
    }

    if (candidate.code === "P2002") {
      return {
        ok: false,
        message: "That domain is already listed.",
        savedAt: null,
      };
    }

    throw error;
  }

  revalidateDomainRoutes();
  return { ok: true, message: "Domain added.", savedAt: Date.now() };
}

export async function updateAttributionDomainAction(
  _: AttributionDomainActionState,
  formData: FormData,
): Promise<AttributionDomainActionState> {
  await requireAdmin();

  if (formData.get("intent") === "remove") {
    const parsed = removeDomainSchema.safeParse({
      id: formData.get("id"),
    });

    if (!parsed.success) {
      return {
        ok: false,
        message: "Choose a domain to remove.",
        savedAt: null,
      };
    }

    try {
      await prisma.attributionDomain.delete({
        where: { id: parsed.data.id },
      });
    } catch (error) {
      if (isMissingAttributionDomainTable(error)) {
        return unavailableState();
      }

      throw error;
    }

    revalidateDomainRoutes();
    return { ok: true, message: "Domain removed.", savedAt: Date.now() };
  }

  const parsed = updateDomainSchema.safeParse({
    id: formData.get("id"),
    domain: formData.get("domain"),
    label: formData.get("label"),
    environment: formData.get("environment"),
    notes: formData.get("notes"),
    isActive: formData.get("isActive") === "on",
    trackingEnabled: overrideValue(formData, "trackingEnabled"),
    consentRequired: overrideValue(formData, "consentRequired"),
    formTrackingEnabled: overrideValue(formData, "formTrackingEnabled"),
    phoneTrackingEnabled: overrideValue(formData, "phoneTrackingEnabled"),
    visibleNumberReplacementEnabled: overrideValue(
      formData,
      "visibleNumberReplacementEnabled",
    ),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the domain details.",
      savedAt: null,
    };
  }

  const { id, ...data } = parsed.data;

  try {
    await prisma.attributionDomain.update({
      where: { id },
      data,
    });
  } catch (error) {
    const candidate = error as { code?: string };
    if (isMissingAttributionDomainTable(error)) {
      return unavailableState();
    }

    if (candidate.code === "P2002") {
      return {
        ok: false,
        message: "Another domain already uses that hostname.",
        savedAt: null,
      };
    }

    throw error;
  }

  revalidateDomainRoutes();
  return { ok: true, message: "Domain updated.", savedAt: Date.now() };
}

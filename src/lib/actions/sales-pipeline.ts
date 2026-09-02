"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  isDocumentUploadType,
  type DocumentUploadType,
} from "@/lib/document-library";
import { prisma } from "@/lib/prisma";
import {
  customerSalesCategoryForStage,
  customerSalesCategoryValues,
} from "@/lib/sales/customer-sales-category";
import {
  salesKanbanCardFieldValues,
  salesKanbanSettingsToJson,
} from "@/lib/sales/kanban-settings";
import { salesStages, type SalesStageValue } from "@/lib/sales/lifecycle";
import {
  stageRequiredDocumentTypesToJson,
  stageRequiredActionValues,
  stageRequiredActionsToJson,
} from "@/lib/sales/stage-requirements";
import { revalidateCrmSettings } from "@/lib/settings";

export type SalesPipelineStageActionState = {
  ok: boolean;
  message: string;
  savedAt: number | null;
};

export type SalesKanbanSettingsActionState = SalesPipelineStageActionState;

const bucketDefaults: Record<
  SalesStageValue,
  {
    color: string;
    probability: number;
    isClosed: boolean;
    isWon: boolean;
    isLost: boolean;
  }
> = {
  LEAD: {
    color: "#6B7280",
    probability: 10,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  QUALIFIED: {
    color: "#2563EB",
    probability: 25,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  PROPOSAL: {
    color: "#7C3AED",
    probability: 55,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  NEGOTIATION: {
    color: "#D97706",
    probability: 75,
    isClosed: false,
    isWon: false,
    isLost: false,
  },
  WON: {
    color: "#059669",
    probability: 100,
    isClosed: true,
    isWon: true,
    isLost: false,
  },
  LOST: {
    color: "#DC2626",
    probability: 0,
    isClosed: true,
    isWon: false,
    isLost: true,
  },
};

const stageSchema = z.object({
  name: z.string().trim().min(2, "Stage name is required.").max(80),
  bucket: z.enum(salesStages),
  customerSalesCategory: z.enum(customerSalesCategoryValues).optional(),
  sortOrder: z.coerce
    .number()
    .int("Sort order must be a whole number.")
    .min(1, "Sort order must be at least 1.")
    .max(10000, "Sort order cannot exceed 10000."),
  defaultProbability: z.coerce
    .number()
    .int("Probability must be a whole number.")
    .min(0, "Probability cannot be below 0%.")
    .max(100, "Probability cannot exceed 100%."),
  color: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null))
    .refine((value) => value === null || /^#[0-9A-F]{6}$/.test(value), {
      message: "Choose a valid hex colour.",
    }),
  description: z
    .string()
    .trim()
    .max(500, "Description cannot exceed 500 characters.")
    .optional()
    .transform((value) => (value ? value : null)),
  goal: z
    .string()
    .trim()
    .max(1000, "Stage goal cannot exceed 1000 characters.")
    .optional()
    .transform((value) => (value ? value : null)),
  aiContext: z
    .string()
    .trim()
    .max(2000, "AI context cannot exceed 2000 characters.")
    .optional()
    .transform((value) => (value ? value : null)),
  slaDays: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : null))
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value >= 1 && value <= 365),
      {
        message: "SLA days must be between 1 and 365.",
      },
    ),
  movementPolicy: z
    .enum(["MANUAL", "AI_SUGGESTED", "RULE_AUTOMATED", "AI_AUTOMATED"])
    .default("MANUAL"),
  gateMode: z.enum(["NONE", "WARN", "BLOCK"]).default("WARN"),
  isActive: z.boolean(),
  requiredActions: z.array(z.enum(stageRequiredActionValues)).default([]),
  requiredDocumentTypes: z.array(z.custom<DocumentUploadType>()).default([]),
});

const salesKanbanSettingsSchema = z.object({
  cardFields: z
    .array(z.enum(salesKanbanCardFieldValues))
    .min(1, "Choose at least one Kanban card field."),
});

function uniqueDocumentTypes(values: unknown[]) {
  const types: DocumentUploadType[] = [];
  const seen = new Set<DocumentUploadType>();

  values.forEach((value) => {
    if (!isDocumentUploadType(value) || seen.has(value)) return;
    seen.add(value);
    types.push(value);
  });

  return types;
}

function stagePayloadFromForm(formData: FormData) {
  return stageSchema.safeParse({
    name: formData.get("name"),
    bucket: formData.get("bucket"),
    customerSalesCategory: formData.get("customerSalesCategory") ?? undefined,
    sortOrder: formData.get("sortOrder"),
    defaultProbability: formData.get("defaultProbability"),
    color: formData.get("color"),
    description: formData.get("description"),
    goal: formData.get("goal"),
    aiContext: formData.get("aiContext"),
    slaDays: formData.get("slaDays"),
    movementPolicy: formData.get("movementPolicy"),
    gateMode: formData.get("gateMode"),
    isActive: formData.get("isActive") === "on",
    requiredActions: formData.getAll("requiredActions"),
    requiredDocumentTypes: uniqueDocumentTypes(
      formData.getAll("requiredDocumentTypes"),
    ),
  });
}

function safeJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function metadataObject(value: unknown): Record<string, Prisma.InputJsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<
    string,
    Prisma.InputJsonValue
  >;
}

function stageMetadataWithRequiredActions({
  metadata,
  requiredDocumentTypes,
  requiredActions,
}: {
  metadata: unknown;
  requiredDocumentTypes: DocumentUploadType[];
  requiredActions: Array<(typeof stageRequiredActionValues)[number]>;
}) {
  return {
    ...metadataObject(metadata),
    requiredDocumentTypes: stageRequiredDocumentTypesToJson(
      requiredDocumentTypes,
    ),
    requiredActions: stageRequiredActionsToJson(requiredActions),
  } satisfies Prisma.InputJsonObject;
}

function normalizeStageFlags(bucket: SalesStageValue) {
  return {
    isClosed: bucketDefaults[bucket].isClosed,
    isWon: bucketDefaults[bucket].isWon,
    isLost: bucketDefaults[bucket].isLost,
  };
}

function normalizeProbability(bucket: SalesStageValue, probability: number) {
  if (bucket === "WON") return 100;
  if (bucket === "LOST") return 0;
  return probability;
}

function slugifyStageName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "stage";
}

async function uniqueStageSlug(name: string) {
  const base = slugifyStageName(name);

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await prisma.salesPipelineStage.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  return `${base}-${Date.now()}`;
}

async function activeBucketRemovalError({
  currentBucket,
  nextBucket,
  nextIsActive,
  stageId,
}: {
  currentBucket: SalesStageValue;
  nextBucket: SalesStageValue;
  nextIsActive: boolean;
  stageId: string;
}) {
  if (currentBucket === nextBucket && nextIsActive) return null;

  const remainingActiveStages = await prisma.salesPipelineStage.count({
    where: {
      bucket: currentBucket,
      isActive: true,
      id: { not: stageId },
    },
  });

  if (remainingActiveStages > 0) return null;

  return `Keep at least one active stage in the ${currentBucket.toLowerCase()} bucket.`;
}

export async function createSalesPipelineStageAction(
  _: SalesPipelineStageActionState,
  formData: FormData,
): Promise<SalesPipelineStageActionState> {
  await requireAdmin();

  const parsed = stagePayloadFromForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the stage details.",
      savedAt: null,
    };
  }

  const slug = await uniqueStageSlug(parsed.data.name);
  const defaults = bucketDefaults[parsed.data.bucket];
  const customerSalesCategory =
    parsed.data.customerSalesCategory ??
    customerSalesCategoryForStage(parsed.data.bucket);

  await prisma.salesPipelineStage.create({
    data: {
      name: parsed.data.name,
      slug,
      bucket: parsed.data.bucket,
      customerSalesCategory,
      sortOrder: parsed.data.sortOrder,
      defaultProbability: normalizeProbability(
        parsed.data.bucket,
        parsed.data.defaultProbability,
      ),
      isActive: parsed.data.isActive,
      ...normalizeStageFlags(parsed.data.bucket),
      color: parsed.data.color ?? defaults.color,
      description: parsed.data.description,
      goal: parsed.data.goal,
      aiContext: parsed.data.aiContext,
      slaDays: parsed.data.slaDays,
      movementPolicy: parsed.data.movementPolicy,
      gateMode: parsed.data.gateMode,
      metadata: {
        custom: true,
        createdFrom: "settings-sales-pipeline",
        requiredDocumentTypes: stageRequiredDocumentTypesToJson(
          parsed.data.requiredDocumentTypes,
        ),
        requiredActions: stageRequiredActionsToJson(
          parsed.data.requiredActions,
        ),
      } satisfies Prisma.InputJsonObject,
    },
  });

  revalidatePath("/settings/sales-pipeline");
  revalidatePath("/sales");
  return { ok: true, message: "Pipeline stage created.", savedAt: Date.now() };
}

export async function updateSalesPipelineStageAction(
  _: SalesPipelineStageActionState,
  formData: FormData,
): Promise<SalesPipelineStageActionState> {
  await requireAdmin();

  const stageId = String(formData.get("stageId") ?? "").trim();
  if (!stageId) {
    return { ok: false, message: "Stage id is missing.", savedAt: null };
  }

  const parsed = stagePayloadFromForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the stage details.",
      savedAt: null,
    };
  }

  const existingStage = await prisma.salesPipelineStage.findUnique({
    where: { id: stageId },
    select: {
      id: true,
      bucket: true,
      isActive: true,
      metadata: true,
      _count: {
        select: {
          opportunities: true,
        },
      },
    },
  });

  if (!existingStage) {
    return { ok: false, message: "Pipeline stage not found.", savedAt: null };
  }

  if (
    existingStage.bucket !== parsed.data.bucket &&
    existingStage._count.opportunities > 0
  ) {
    return {
      ok: false,
      message:
        "Stages linked to sales cannot change reporting bucket yet. Create a new stage instead.",
      savedAt: null,
    };
  }

  if (existingStage.isActive) {
    const removalError = await activeBucketRemovalError({
      currentBucket: existingStage.bucket,
      nextBucket: parsed.data.bucket,
      nextIsActive: parsed.data.isActive,
      stageId,
    });

    if (removalError) {
      return { ok: false, message: removalError, savedAt: null };
    }
  }

  const customerSalesCategory =
    parsed.data.customerSalesCategory ??
    customerSalesCategoryForStage(parsed.data.bucket);

  await prisma.$transaction([
    prisma.salesPipelineStage.update({
      where: { id: stageId },
      data: {
        name: parsed.data.name,
        bucket: parsed.data.bucket,
        customerSalesCategory,
        sortOrder: parsed.data.sortOrder,
        defaultProbability: normalizeProbability(
          parsed.data.bucket,
          parsed.data.defaultProbability,
        ),
        isActive: parsed.data.isActive,
        ...normalizeStageFlags(parsed.data.bucket),
        color: parsed.data.color ?? bucketDefaults[parsed.data.bucket].color,
        description: parsed.data.description,
        goal: parsed.data.goal,
        aiContext: parsed.data.aiContext,
        slaDays: parsed.data.slaDays,
        movementPolicy: parsed.data.movementPolicy,
        gateMode: parsed.data.gateMode,
        metadata: stageMetadataWithRequiredActions({
          metadata: existingStage.metadata,
          requiredDocumentTypes: parsed.data.requiredDocumentTypes,
          requiredActions: parsed.data.requiredActions,
        }),
      },
    }),
    prisma.salesOpportunity.updateMany({
      where: { salesPipelineStageId: stageId },
      data: { customerSalesCategory },
    }),
  ]);

  revalidatePath("/settings/sales-pipeline");
  revalidatePath("/sales");
  return { ok: true, message: "Pipeline stage saved.", savedAt: Date.now() };
}

export async function updateSalesKanbanSettingsAction(
  _: SalesKanbanSettingsActionState,
  formData: FormData,
): Promise<SalesKanbanSettingsActionState> {
  await requireAdmin();

  const parsed = salesKanbanSettingsSchema.safeParse({
    cardFields: formData.getAll("cardFields"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ?? "Choose the Kanban card fields.",
      savedAt: null,
    };
  }

  await prisma.crmSettings.upsert({
    where: { id: "default" },
    update: {
      salesKanban: safeJson(salesKanbanSettingsToJson(parsed.data)),
    },
    create: {
      id: "default",
      companiesEnabled: true,
      salesKanban: safeJson(salesKanbanSettingsToJson(parsed.data)),
    },
  });

  revalidateCrmSettings();
  revalidatePath("/settings/sales-pipeline");
  revalidatePath("/sales");

  return {
    ok: true,
    message: "Kanban board settings saved.",
    savedAt: Date.now(),
  };
}

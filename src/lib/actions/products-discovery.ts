"use server";

import { FileAssetVisibility, Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { revalidateProductDiscoveryObjectData } from "@/lib/object-data/products-discovery";
import { prisma } from "@/lib/prisma";
import {
  normalizeProductTags,
  sanitizeTagRuleConditions,
  type ProductCategoryTagRuleJoin,
  type ProductCategoryTagRuleOperator,
} from "@/lib/products/category-rules";
import { uploadMediaFile } from "@/lib/storage/media";

export type ProductDiscoveryActionState = {
  ok: boolean;
  message: string;
};

const productTypes = [
  "SERVICE",
  "PHYSICAL",
  "DIGITAL",
  "SUBSCRIPTION",
  "BUNDLE",
] as const;
const categoryCollectionModes = ["MANUAL", "AUTOMATED"] as const;
const categoryRuleMatches = ["ANY", "ALL"] as const;
const templateScopes = ["LEAD", "PRODUCT", "CATEGORY"] as const;
const questionScopes = [
  "OPPORTUNITY",
  "PRODUCT",
  "CATEGORY",
  "LINE_ITEM",
] as const;
const answerTypes = [
  "TEXT",
  "LONG_TEXT",
  "URL",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "PRODUCT_SELECT",
  "PRODUCT_MULTI_SELECT",
  "CATEGORY_SELECT",
  "CATEGORY_MULTI_SELECT",
  "NUMBER",
  "DATE",
  "DATETIME",
  "CURRENCY",
  "CURRENCY_RANGE",
  "DOMAIN",
  "SLIDER",
] as const;
const answerModes = ["SINGLE", "MULTIPLE_MAX", "MULTIPLE_UNLIMITED"] as const;
const discoveryRuleOperators = [
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "answered",
  "not_answered",
] as const;
const discoveryRuleOperatorSet = new Set<string>(discoveryRuleOperators);

const productSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Product name is required."),
  slug: z.string().trim().optional(),
  type: z.enum(productTypes).default("SERVICE"),
  categoryId: z.string().trim().optional(),
  newCategoryName: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  description: z.string().trim().optional(),
  tagsText: z.string().trim().optional(),
  isActive: z.boolean().default(false),
  removeImage: z.boolean().default(false),
  templateIds: z.array(z.string().trim()).default([]),
});

const categorySchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Category name is required."),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional(),
  collectionMode: z.enum(categoryCollectionModes).default("MANUAL"),
  ruleMatch: z.enum(categoryRuleMatches).default("ANY"),
  ruleTagsText: z.string().trim().optional(),
  ruleConditionTags: z.array(z.string().trim()).default([]),
  ruleConditionOperators: z.array(z.string().trim()).default([]),
  ruleConditionJoins: z.array(z.string().trim()).default([]),
  productIds: z.array(z.string().trim()).default([]),
  isActive: z.boolean().default(false),
});

const questionSchema = z.object({
  id: z.string().trim().optional(),
  label: z.string().trim().min(2, "Question label is required."),
  slug: z.string().trim().optional(),
  helpText: z.string().trim().optional(),
  scope: z.enum(questionScopes).default("OPPORTUNITY"),
  answerType: z.enum(answerTypes).default("TEXT"),
  answerMode: z.enum(answerModes).default("SINGLE"),
  maxAnswers: z.string().trim().optional(),
  optionsText: z.string().trim().optional(),
  defaultRequired: z.boolean().default(false),
  dedupeKey: z.string().trim().optional(),
  isActive: z.boolean().default(false),
});

const templateSchema = z.object({
  id: z.string().trim().optional(),
  name: z.string().trim().min(2, "Template name is required."),
  slug: z.string().trim().optional(),
  scope: z.enum(templateScopes).default("LEAD"),
  description: z.string().trim().optional(),
  salesPipelineStageId: z.string().trim().optional(),
  isActive: z.boolean().default(false),
  questionIds: z.array(z.string().trim()).default([]),
  requiredQuestionIds: z.array(z.string().trim()).default([]),
  productIds: z.array(z.string().trim()).default([]),
  categoryIds: z.array(z.string().trim()).default([]),
});

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function formStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function optional(value: string | undefined) {
  return value?.trim() ? value.trim() : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseQuestionOptions(value: string | undefined) {
  const options = (value ?? "")
    .split(/\r?\n|,/)
    .map((option) => option.trim())
    .filter(Boolean);

  return options.length ? options : null;
}

function parseTagList(value: string | undefined) {
  return normalizeProductTags(
    (value ?? "")
      .split(/\r?\n|,/)
      .filter(Boolean),
  );
}

function parseTagRuleConditions(data: z.infer<typeof categorySchema>) {
  const rowConditions = data.ruleConditionTags.map((tag, index) => ({
    tag,
    operator:
      data.ruleConditionOperators[index] === "DOES_NOT_HAVE_TAG"
        ? "DOES_NOT_HAVE_TAG"
        : ("HAS_TAG" as ProductCategoryTagRuleOperator),
    join:
      data.ruleConditionJoins[index] === "OR"
        ? "OR"
        : ("AND" as ProductCategoryTagRuleJoin),
  }));
  const conditions = sanitizeTagRuleConditions(rowConditions);

  if (conditions.length) return conditions;

  return sanitizeTagRuleConditions(
    parseTagList(data.ruleTagsText).map((tag, index) => ({
      tag,
      operator: "HAS_TAG",
      join: index === 0 || data.ruleMatch === "ALL" ? "AND" : "OR",
    })),
  );
}

function parseMaxAnswers(
  value: string | undefined,
  answerMode: (typeof answerModes)[number],
) {
  if (answerMode !== "MULTIPLE_MAX") return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 50) return null;

  return parsed;
}

function templateQuestionRule(
  formData: FormData,
  prefix: string,
  questionId: string,
  sourceQuestionIds: Set<string>,
  label: string,
) {
  const sourceQuestionId = formString(
    formData,
    `${prefix}:${questionId}:questionId`,
  )?.trim();
  if (!sourceQuestionId) return Prisma.JsonNull;

  if (sourceQuestionId === questionId || !sourceQuestionIds.has(sourceQuestionId)) {
    throw new Error(`${label} uses a question that is not available in this template.`);
  }

  const rawOperator =
    formString(formData, `${prefix}:${questionId}:operator`)?.trim() || "equals";
  const operator = discoveryRuleOperatorSet.has(rawOperator)
    ? rawOperator
    : null;

  if (!operator) {
    throw new Error(`${label} uses an unsupported condition operator.`);
  }

  const value =
    operator === "answered" || operator === "not_answered"
      ? ""
      : (formString(formData, `${prefix}:${questionId}:value`)?.trim() ?? "");

  return {
    rules: [
      {
        operator,
        questionId: sourceQuestionId,
        value,
      },
    ],
  } satisfies Prisma.InputJsonObject;
}

async function uniqueProductSlug(base: string, id?: string) {
  let slug = base;
  let suffix = 2;

  while (
    await prisma.product.findFirst({
      where: { slug, id: id ? { not: id } : undefined },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function uniqueCategorySlug(base: string) {
  let slug = base;
  let suffix = 2;

  while (await prisma.productCategory.findUnique({ where: { slug } })) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function uniqueCategorySlugForSave(base: string, id?: string) {
  let slug = base;
  let suffix = 2;

  while (
    await prisma.productCategory.findFirst({
      where: { slug, id: id ? { not: id } : undefined },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function uniqueQuestionSlug(base: string, id?: string) {
  let slug = base;
  let suffix = 2;

  while (
    await prisma.discoveryQuestion.findFirst({
      where: { slug, id: id ? { not: id } : undefined },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function uniqueTemplateSlug(base: string, id?: string) {
  let slug = base;
  let suffix = 2;

  while (
    await prisma.discoveryTemplate.findFirst({
      where: { slug, id: id ? { not: id } : undefined },
    })
  ) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function categoryIdForProduct(data: z.infer<typeof productSchema>) {
  if (data.newCategoryName?.trim()) {
    const name = data.newCategoryName.trim();
    const slug = await uniqueCategorySlug(slugify(name) || "category");
    const category = await prisma.productCategory.create({
      data: { name, slug },
      select: { id: true },
    });

    return category.id;
  }

  return data.categoryId && data.categoryId !== "none" ? data.categoryId : null;
}

export async function saveProductAction(
  _: ProductDiscoveryActionState,
  formData: FormData,
): Promise<ProductDiscoveryActionState> {
  const user = await requireAdmin();
  const imageFile = formData.get("imageFile");

  const parsed = productSchema.safeParse({
    id: formString(formData, "id"),
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    type: formString(formData, "type"),
    categoryId: formString(formData, "categoryId"),
    newCategoryName: formString(formData, "newCategoryName"),
    sku: formString(formData, "sku"),
    description: formString(formData, "description"),
    tagsText: formString(formData, "tagsText"),
    salesPipelineStageId: formString(formData, "salesPipelineStageId"),
    isActive: formBoolean(formData, "isActive"),
    removeImage: formBoolean(formData, "removeImage"),
    templateIds: formStrings(formData, "templateIds"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the product.",
    };
  }

  const data = parsed.data;
  const baseSlug = slugify(data.slug || data.name) || "product";
  const categoryId = await categoryIdForProduct(data);
  const tags = parseTagList(data.tagsText);
  const templateIds = uniqueValues(data.templateIds);
  const hasImageUpload = imageFile instanceof File && imageFile.size > 0;
  const shouldUpdateTemplateAssignments =
    formData.get("updateTemplateAssignments") === "on";

  if (data.id) {
    const existing = await prisma.product.findUnique({
      where: { id: data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Product not found." };
  }

  const slug = await uniqueProductSlug(baseSlug, data.id);

  const savedProduct = await prisma.$transaction(async (tx) => {
    const savedProduct = data.id
      ? await tx.product.update({
          where: { id: data.id },
          data: {
            name: data.name,
            slug,
            type: data.type,
            categoryId,
            sku: optional(data.sku),
            description: optional(data.description),
            tags,
            isActive: data.isActive,
          },
          select: { id: true },
        })
      : await tx.product.create({
          data: {
            name: data.name,
            slug,
            type: data.type,
            categoryId,
            sku: optional(data.sku),
            description: optional(data.description),
            tags,
            isActive: data.isActive,
          },
          select: { id: true },
        });

    if (shouldUpdateTemplateAssignments) {
      await tx.productDiscoveryTemplate.deleteMany({
        where: { productId: savedProduct.id },
      });
      if (templateIds.length) {
        await tx.productDiscoveryTemplate.createMany({
          data: templateIds.map((templateId) => ({
            productId: savedProduct.id,
            templateId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (categoryId) {
      await tx.productCategoryProduct.upsert({
        where: {
          categoryId_productId: {
            categoryId,
            productId: savedProduct.id,
          },
        },
        update: {},
        create: {
          categoryId,
          productId: savedProduct.id,
        },
      });
    }

    return savedProduct;
  });

  if (data.removeImage && !hasImageUpload) {
    await prisma.product.update({
      where: { id: savedProduct.id },
      data: { imageFileAssetId: null },
    });
  }

  if (hasImageUpload) {
    try {
      const fileAsset = await uploadMediaFile({
        file: imageFile,
        folder: `products/${savedProduct.id}`,
        entityType: "Product",
        entityId: savedProduct.id,
        uploadedById: user.id,
        visibility: FileAssetVisibility.PRIVATE,
        maxUploadMb: 8,
        requireImage: true,
      });

      await prisma.product.update({
        where: { id: savedProduct.id },
        data: { imageFileAssetId: fileAsset.id },
      });
    } catch (error) {
      revalidateProductDiscoveryObjectData();

      return {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Product image upload failed.",
      };
    }
  }

  revalidateProductDiscoveryObjectData();

  return {
    ok: true,
    message: data.id ? "Product updated." : "Product added.",
  };
}

export async function saveProductCategoryAction(
  _: ProductDiscoveryActionState,
  formData: FormData,
): Promise<ProductDiscoveryActionState> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    id: formString(formData, "id"),
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    description: formString(formData, "description"),
    collectionMode: formString(formData, "collectionMode"),
    ruleMatch: formString(formData, "ruleMatch"),
    ruleTagsText: formString(formData, "ruleTagsText"),
    ruleConditionTags: formStrings(formData, "ruleConditionTags"),
    ruleConditionOperators: formStrings(formData, "ruleConditionOperators"),
    ruleConditionJoins: formStrings(formData, "ruleConditionJoins"),
    productIds: formStrings(formData, "productIds"),
    isActive: formBoolean(formData, "isActive"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the category.",
    };
  }

  const data = parsed.data;
  const baseSlug = slugify(data.slug || data.name) || "category";
  const slug = await uniqueCategorySlugForSave(baseSlug, data.id);
  const ruleConditions =
    data.collectionMode === "AUTOMATED"
      ? parseTagRuleConditions(data)
      : [];
  const ruleTags = normalizeProductTags(
    ruleConditions
      .filter((condition) => condition.operator === "HAS_TAG")
      .map((condition) => condition.tag),
  );
  const ruleMatch = ruleConditions.some((condition) => condition.join === "OR")
    ? "ANY"
    : "ALL";
  const productIds =
    data.collectionMode === "MANUAL" ? uniqueValues(data.productIds) : [];

  if (data.collectionMode === "AUTOMATED" && !ruleConditions.length) {
    return {
      ok: false,
      message: "Add at least one tag condition for an automated category.",
    };
  }

  if (data.id) {
    const existing = await prisma.productCategory.findUnique({
      where: { id: data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Category not found." };
  }

  await prisma.$transaction(async (tx) => {
    const category = data.id
      ? await tx.productCategory.update({
          where: { id: data.id },
          data: {
            name: data.name,
            slug,
            description: optional(data.description),
            collectionMode: data.collectionMode,
            ruleMatch,
            ruleTags,
            ruleConditions:
              data.collectionMode === "AUTOMATED"
                ? (ruleConditions as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            isActive: data.isActive,
          },
          select: { id: true },
        })
      : await tx.productCategory.create({
          data: {
            name: data.name,
            slug,
            description: optional(data.description),
            collectionMode: data.collectionMode,
            ruleMatch,
            ruleTags,
            ruleConditions:
              data.collectionMode === "AUTOMATED"
                ? (ruleConditions as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            isActive: data.isActive,
          },
          select: { id: true },
        });

    await tx.productCategoryProduct.deleteMany({
      where: { categoryId: category.id },
    });

    if (productIds.length) {
      await tx.productCategoryProduct.createMany({
        data: productIds.map((productId, index) => ({
          categoryId: category.id,
          productId,
          sortOrder: index + 1,
        })),
        skipDuplicates: true,
      });

      await tx.product.updateMany({
        where: { id: { in: productIds }, categoryId: null },
        data: { categoryId: category.id },
      });
    }
  });

  revalidateProductDiscoveryObjectData();

  return {
    ok: true,
    message: data.id ? "Category updated." : "Category added.",
  };
}

export async function saveDiscoveryQuestionAction(
  _: ProductDiscoveryActionState,
  formData: FormData,
): Promise<ProductDiscoveryActionState> {
  await requireAdmin();

  const parsed = questionSchema.safeParse({
    id: formString(formData, "id"),
    label: formString(formData, "label"),
    slug: formString(formData, "slug"),
    helpText: formString(formData, "helpText"),
    scope: formString(formData, "scope"),
    answerType: formString(formData, "answerType"),
    answerMode: formString(formData, "answerMode"),
    maxAnswers: formString(formData, "maxAnswers"),
    optionsText: formString(formData, "optionsText"),
    defaultRequired: formBoolean(formData, "defaultRequired"),
    dedupeKey: formString(formData, "dedupeKey"),
    isActive: formBoolean(formData, "isActive"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the question.",
    };
  }

  const data = parsed.data;
  const baseSlug = slugify(data.slug || data.label) || "question";
  const options = parseQuestionOptions(data.optionsText);
  const optionsValue = options ?? Prisma.JsonNull;
  const maxAnswers = parseMaxAnswers(data.maxAnswers, data.answerMode);

  if (data.id) {
    const existing = await prisma.discoveryQuestion.findUnique({
      where: { id: data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Question not found." };
  }

  if (
    (data.answerType === "SINGLE_SELECT" ||
      data.answerType === "MULTI_SELECT" ||
      data.answerType === "CURRENCY_RANGE") &&
    !options
  ) {
    return {
      ok: false,
      message: "Add at least one option for select or currency-range questions.",
    };
  }

  if (data.answerMode === "MULTIPLE_MAX" && !maxAnswers) {
    return { ok: false, message: "Set a max answer count between 2 and 50." };
  }

  if (data.id) {
    await prisma.discoveryQuestion.update({
      where: { id: data.id },
      data: {
        label: data.label,
        slug: await uniqueQuestionSlug(baseSlug, data.id),
        helpText: optional(data.helpText),
        scope: data.scope,
        answerType: data.answerType,
        answerMode: data.answerMode,
        maxAnswers,
        options: optionsValue,
        defaultRequired: data.defaultRequired,
        dedupeKey: optional(data.dedupeKey),
        isActive: data.isActive,
      },
    });
  } else {
    await prisma.discoveryQuestion.create({
      data: {
        label: data.label,
        slug: await uniqueQuestionSlug(baseSlug),
        helpText: optional(data.helpText),
        scope: data.scope,
        answerType: data.answerType,
        answerMode: data.answerMode,
        maxAnswers,
        options: optionsValue,
        defaultRequired: data.defaultRequired,
        dedupeKey: optional(data.dedupeKey),
        isActive: data.isActive,
      },
    });
  }

  revalidateProductDiscoveryObjectData();

  return {
    ok: true,
    message: data.id ? "Question updated." : "Question added.",
  };
}

export async function saveDiscoveryTemplateAction(
  _: ProductDiscoveryActionState,
  formData: FormData,
): Promise<ProductDiscoveryActionState> {
  await requireAdmin();

  const parsed = templateSchema.safeParse({
    id: formString(formData, "id"),
    name: formString(formData, "name"),
    slug: formString(formData, "slug"),
    scope: formString(formData, "scope"),
    description: formString(formData, "description"),
    isActive: formBoolean(formData, "isActive"),
    questionIds: formStrings(formData, "questionIds"),
    requiredQuestionIds: formStrings(formData, "requiredQuestionIds"),
    productIds: formStrings(formData, "productIds"),
    categoryIds: formStrings(formData, "categoryIds"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the template.",
    };
  }

  const data = parsed.data;
  const baseSlug = slugify(data.slug || data.name) || "template";
  const questionIds = uniqueValues(data.questionIds);
  const requiredIds = new Set(uniqueValues(data.requiredQuestionIds));
  const questionIdSet = new Set(questionIds);
  const productIds =
    data.scope === "PRODUCT" ? uniqueValues(data.productIds) : [];
  const categoryIds =
    data.scope === "CATEGORY" ? uniqueValues(data.categoryIds) : [];
  const salesPipelineStageId = optional(data.salesPipelineStageId);
  const slug = await uniqueTemplateSlug(baseSlug, data.id);

  if (!questionIds.length) {
    return {
      ok: false,
      message: "Attach at least one question to the template.",
    };
  }

  let questionRules: Array<{
    questionId: string;
    requirementRules: Prisma.InputJsonObject | typeof Prisma.JsonNull;
    visibilityRules: Prisma.InputJsonObject | typeof Prisma.JsonNull;
  }>;

  try {
    questionRules = questionIds.map((questionId) => ({
      questionId,
      requirementRules: templateQuestionRule(
        formData,
        "requirementRule",
        questionId,
        questionIdSet,
        "Require rule",
      ),
      visibilityRules: templateQuestionRule(
        formData,
        "visibilityRule",
        questionId,
        questionIdSet,
        "Show rule",
      ),
    }));
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Check the template question rules.",
    };
  }

  if (data.id) {
    const existing = await prisma.discoveryTemplate.findUnique({
      where: { id: data.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, message: "Template not found." };
  }

  await prisma.$transaction(async (tx) => {
    const template = data.id
      ? await tx.discoveryTemplate.update({
          where: { id: data.id },
          data: {
            name: data.name,
            slug,
            scope: data.scope,
            salesPipelineStageId,
            description: optional(data.description),
            isActive: data.isActive,
          },
          select: { id: true },
        })
      : await tx.discoveryTemplate.create({
          data: {
            name: data.name,
            slug,
            scope: data.scope,
            salesPipelineStageId,
            description: optional(data.description),
            isActive: data.isActive,
          },
          select: { id: true },
        });

    await tx.discoveryTemplateQuestion.deleteMany({
      where: { templateId: template.id },
    });
    await tx.discoveryTemplateQuestion.createMany({
      data: questionRules.map((questionRule, index) => ({
        templateId: template.id,
        questionId: questionRule.questionId,
        sortOrder: index + 1,
        required: requiredIds.has(questionRule.questionId),
        requirementRules: questionRule.requirementRules,
        visibilityRules: questionRule.visibilityRules,
      })),
      skipDuplicates: true,
    });

    await tx.productDiscoveryTemplate.deleteMany({
      where: { templateId: template.id },
    });
    if (productIds.length) {
      await tx.productDiscoveryTemplate.createMany({
        data: productIds.map((productId) => ({
          productId,
          templateId: template.id,
        })),
        skipDuplicates: true,
      });
    }

    await tx.productCategoryDiscoveryTemplate.deleteMany({
      where: { templateId: template.id },
    });
    if (categoryIds.length) {
      await tx.productCategoryDiscoveryTemplate.createMany({
        data: categoryIds.map((categoryId) => ({
          categoryId,
          templateId: template.id,
        })),
        skipDuplicates: true,
      });
    }
  });

  revalidateProductDiscoveryObjectData();

  return {
    ok: true,
    message: data.id ? "Template updated." : "Template added.",
  };
}

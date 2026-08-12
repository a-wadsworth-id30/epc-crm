import "server-only";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import type {
  DiscoveryLinkOption,
  DiscoveryQuestionRow,
  DiscoveryTemplateRow,
} from "@/components/crm-boilerplate/DiscoveryQuestionSetupView";
import type {
  ProductCatalogRow,
  ProductCategoryOption,
  ProductTemplateOption,
} from "@/components/crm-boilerplate/ProductCatalogView";
import { prisma } from "@/lib/prisma";
import {
  productMatchesTagRuleConditions,
  tagRuleConditionsFromUnknown,
} from "@/lib/products/category-rules";
import { mediaAssetUrl } from "@/lib/storage/media";

const productDiscoveryObjectDataCacheTag = "object-data:products-discovery";
const productDiscoveryObjectDataRevalidateSeconds = 300;

async function loadProductCatalogObjectDataUncached() {
  const [products, categories, templates] = await Promise.all([
    prisma.product.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        category: { select: { id: true, name: true } },
        categoryAssignments: {
          include: {
            category: {
              select: {
                id: true,
                name: true,
                collectionMode: true,
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
        imageFileAsset: { select: { id: true } },
        discoveryTemplates: {
          include: {
            template: {
              include: {
                questions: {
                  select: { questionId: true },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        manualProducts: {
          select: { productId: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.discoveryTemplate.findMany({
      where: { isActive: true, scope: { in: ["PRODUCT", "CATEGORY"] } },
      orderBy: [{ scope: "asc" }, { name: "asc" }],
      select: { id: true, name: true, scope: true },
    }),
  ]);

  const automatedCategoryIdsByProduct = new Map<string, string[]>();
  const automatedCategoryNamesByProduct = new Map<string, string[]>();
  const categoryRuleConditions = new Map(
    categories.map((category) => [
      category.id,
      tagRuleConditionsFromUnknown(
        category.ruleConditions,
        category.ruleTags,
        category.ruleMatch,
      ),
    ]),
  );

  for (const category of categories) {
    const conditions = categoryRuleConditions.get(category.id) ?? [];

    if (category.collectionMode !== "AUTOMATED" || !conditions.length) {
      continue;
    }

    for (const product of products) {
      if (!productMatchesTagRuleConditions(product.tags, conditions)) {
        continue;
      }

      automatedCategoryIdsByProduct.set(product.id, [
        ...(automatedCategoryIdsByProduct.get(product.id) ?? []),
        category.id,
      ]);
      automatedCategoryNamesByProduct.set(product.id, [
        ...(automatedCategoryNamesByProduct.get(product.id) ?? []),
        category.name,
      ]);
    }
  }

  const productRows: ProductCatalogRow[] = products.map((product) => {
    const manualCategoryIds = product.categoryAssignments.map(
      (assignment) => assignment.category.id,
    );
    const manualCategoryNames = product.categoryAssignments.map(
      (assignment) => assignment.category.name,
    );
    const automatedCategoryIds =
      automatedCategoryIdsByProduct.get(product.id) ?? [];
    const automatedCategoryNames =
      automatedCategoryNamesByProduct.get(product.id) ?? [];
    const categoryIds = Array.from(
      new Set([
        ...manualCategoryIds,
        ...automatedCategoryIds,
        ...(product.category?.id ? [product.category.id] : []),
      ]),
    );
    const categoryNames = Array.from(
      new Set([
        ...manualCategoryNames,
        ...automatedCategoryNames,
        ...(product.category?.name ? [product.category.name] : []),
      ]),
    );

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      type: product.type,
      sku: product.sku,
      description: product.description,
      tags: product.tags,
      isActive: product.isActive,
      imageUrl: product.imageFileAsset
        ? mediaAssetUrl(product.imageFileAsset.id)
        : null,
      categoryId: product.category?.id ?? null,
      categoryName: product.category?.name ?? null,
      categoryIds,
      categoryNames,
      manualCategoryIds,
      automatedCategoryIds,
      templateIds: product.discoveryTemplates.map(
        (assignment) => assignment.template.id,
      ),
      templateNames: product.discoveryTemplates.map(
        (assignment) => assignment.template.name,
      ),
      questionCount: product.discoveryTemplates.reduce(
        (total, assignment) => total + assignment.template.questions.length,
        0,
      ),
    };
  });
  const categoryOptions: ProductCategoryOption[] = categories.map(
    (category) => {
      const automatedProductIds =
        category.collectionMode === "AUTOMATED" &&
        (categoryRuleConditions.get(category.id)?.length ?? 0) > 0
          ? productRows
              .filter((product) => product.automatedCategoryIds.includes(category.id))
              .map((product) => product.id)
          : [];
      const productIds =
        category.collectionMode === "MANUAL"
          ? category.manualProducts.map((assignment) => assignment.productId)
          : automatedProductIds;
      const categoryProducts = productRows.filter((product) =>
        product.categoryIds.includes(category.id),
      );

      return {
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
        collectionMode: category.collectionMode,
        ruleMatch: category.ruleMatch,
        ruleTags: category.ruleTags,
        ruleConditions: categoryRuleConditions.get(category.id) ?? [],
        isActive: category.isActive,
        productIds,
        productCount: categoryProducts.length,
        activeProductCount: categoryProducts.filter((product) => product.isActive)
          .length,
      };
    },
  );
  const templateOptions: ProductTemplateOption[] = templates;

  return {
    categories: categoryOptions,
    products: productRows,
    templates: templateOptions,
  };
}

async function loadDiscoveryQuestionObjectDataUncached() {
  const [templates, questions, products, categories] = await Promise.all([
    prisma.discoveryTemplate.findMany({
      orderBy: [{ scope: "asc" }, { name: "asc" }],
      include: {
        salesPipelineStage: { select: { id: true, name: true } },
        products: {
          include: {
            product: { select: { id: true, name: true } },
          },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        questions: {
          orderBy: [{ sortOrder: "asc" }],
          include: {
            question: true,
          },
        },
      },
    }),
    prisma.discoveryQuestion.findMany({
      orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { label: "asc" }],
      include: {
        templates: {
          include: {
            template: { select: { name: true } },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.productCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const templateRows: DiscoveryTemplateRow[] = templates.map((template) => ({
    id: template.id,
    name: template.name,
    slug: template.slug,
    scope: template.scope,
    description: template.description,
    isActive: template.isActive,
    version: template.version,
    salesPipelineStageId: template.salesPipelineStage?.id ?? null,
    salesPipelineStageName: template.salesPipelineStage?.name ?? null,
    productIds: template.products.map((assignment) => assignment.product.id),
    productNames: template.products.map(
      (assignment) => assignment.product.name,
    ),
    categoryIds: template.categories.map(
      (assignment) => assignment.category.id,
    ),
    categoryNames: template.categories.map(
      (assignment) => assignment.category.name,
    ),
    questions: template.questions.map((assignment) => ({
      id: assignment.question.id,
      label: assignment.question.label,
      scope: assignment.question.scope,
      answerType: assignment.question.answerType,
      answerMode: assignment.question.answerMode,
      maxAnswers: assignment.question.maxAnswers,
      required: assignment.required,
      requirementRules: assignment.requirementRules,
      visibilityRules: assignment.visibilityRules,
    })),
  }));

  const questionRows: DiscoveryQuestionRow[] = questions.map((question) => ({
    id: question.id,
    slug: question.slug,
    label: question.label,
    helpText: question.helpText,
    scope: question.scope,
    answerType: question.answerType,
    answerMode: question.answerMode,
    maxAnswers: question.maxAnswers,
    optionsText: Array.isArray(question.options)
      ? question.options.map((option) => String(option)).join("\n")
      : "",
    defaultRequired: question.defaultRequired,
    dedupeKey: question.dedupeKey,
    isActive: question.isActive,
    templateNames: question.templates.map(
      (assignment) => assignment.template.name,
    ),
  }));
  const productOptions: DiscoveryLinkOption[] = products;
  const categoryOptions: DiscoveryLinkOption[] = categories;

  return {
    categories: categoryOptions,
    products: productOptions,
    questions: questionRows,
    templates: templateRows,
  };
}

export const getProductCatalogObjectData = unstable_cache(
  loadProductCatalogObjectDataUncached,
  ["product-catalog-object-data"],
  {
    revalidate: productDiscoveryObjectDataRevalidateSeconds,
    tags: [productDiscoveryObjectDataCacheTag],
  },
);

export const getDiscoveryQuestionObjectData = unstable_cache(
  loadDiscoveryQuestionObjectDataUncached,
  ["discovery-question-object-data"],
  {
    revalidate: productDiscoveryObjectDataRevalidateSeconds,
    tags: [productDiscoveryObjectDataCacheTag],
  },
);

export function revalidateProductDiscoveryObjectData() {
  revalidateTag(productDiscoveryObjectDataCacheTag, "max");
  revalidatePath("/products");
  revalidatePath("/products/categories");
  revalidatePath("/products/inventory");
  revalidatePath("/discovery");
  revalidatePath("/questions");
}

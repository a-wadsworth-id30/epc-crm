import "server-only";

import type { Prisma } from "@prisma/client";
import {
  parseStageRequiredActions,
  parseStageRequiredDocumentTypes,
  stageRequirementHasEvidence,
  stageRequiredActionLabel,
  stageRequiredDocumentTypesLabel,
} from "@/lib/sales/stage-requirements";

type StageGateClient = Pick<
  Prisma.TransactionClient,
  | "discoveryTemplate"
  | "fileAsset"
  | "opportunityDiscoveryAnswer"
  | "opportunityProduct"
  | "salesCommunication"
  | "salesOpportunity"
  | "salesPipelineStage"
  | "task"
>;

export type StageGateResult = {
  mode: "NONE" | "WARN" | "BLOCK";
  passed: boolean;
  missing: Array<{
    questionId: string;
    label: string;
    templateName: string;
  }>;
};

type JsonRecord = Record<string, unknown>;

export async function evaluateStageGate({
  client,
  opportunityId,
  salesPipelineStageId,
}: {
  client: StageGateClient;
  opportunityId: string;
  salesPipelineStageId: string | null | undefined;
}): Promise<StageGateResult> {
  if (!salesPipelineStageId) {
    return { mode: "NONE", passed: true, missing: [] };
  }

  const stage = await client.salesPipelineStage.findUnique({
    where: { id: salesPipelineStageId },
    select: { gateMode: true, metadata: true },
  });

  if (!stage || stage.gateMode === "NONE") {
    return { mode: "NONE", passed: true, missing: [] };
  }

  const opportunityProducts = await client.opportunityProduct.findMany({
    where: { opportunityId, status: { not: "DECLINED" } },
    select: {
      productId: true,
      product: { select: { categoryId: true } },
    },
  });
  const productIds = new Set(
    opportunityProducts.map((product) => product.productId),
  );
  const categoryIds = new Set(
    opportunityProducts
      .map((product) => product.product?.categoryId)
      .filter((categoryId): categoryId is string => Boolean(categoryId)),
  );
  const templates = await client.discoveryTemplate.findMany({
    where: {
      isActive: true,
      salesPipelineStageId,
    },
    select: {
      id: true,
      name: true,
      scope: true,
      products: { select: { productId: true } },
      categories: { select: { categoryId: true } },
      questions: {
        where: { required: true },
        select: {
          questionId: true,
          question: { select: { label: true } },
        },
      },
    },
  });
  const requiredQuestions = new Map<
    string,
    { label: string; templateName: string }
  >();
  const requiredActions = parseStageRequiredActions(stage.metadata);

  for (const template of templates) {
    if (!templateApplies({ categoryIds, productIds, template })) continue;

    for (const assignment of template.questions) {
      requiredQuestions.set(assignment.questionId, {
        label: assignment.question.label,
        templateName: template.name,
      });
    }
  }

  const missingRequirements = requiredActions.length
    ? await missingStageRequirements({
        client,
        opportunityId,
        requiredDocumentTypes: parseStageRequiredDocumentTypes(stage.metadata),
        requiredActions,
      })
    : [];

  if (!requiredQuestions.size && !missingRequirements.length) {
    return { mode: stage.gateMode, passed: true, missing: [] };
  }

  const answers = await client.opportunityDiscoveryAnswer.findMany({
    where: {
      opportunityId,
      questionId: { in: Array.from(requiredQuestions.keys()) },
    },
    select: {
      questionId: true,
      value: true,
      answeredAt: true,
      confirmedAt: true,
    },
  });
  const answeredQuestionIds = new Set(
    answers
      .filter(
        (answer) =>
          answer.answeredAt ||
          answer.confirmedAt ||
          hasAnswerValue(answer.value),
      )
      .map((answer) => answer.questionId),
  );
  const missingQuestions = Array.from(requiredQuestions.entries())
    .filter(([questionId]) => !answeredQuestionIds.has(questionId))
    .map(([questionId, question]) => ({ questionId, ...question }));
  const missing = [...missingQuestions, ...missingRequirements];

  return {
    mode: stage.gateMode,
    passed: missing.length === 0 || stage.gateMode !== "BLOCK",
    missing,
  };
}

async function missingStageRequirements({
  client,
  opportunityId,
  requiredDocumentTypes,
  requiredActions,
}: {
  client: StageGateClient;
  opportunityId: string;
  requiredDocumentTypes: ReturnType<typeof parseStageRequiredDocumentTypes>;
  requiredActions: ReturnType<typeof parseStageRequiredActions>;
}): Promise<StageGateResult["missing"]> {
  const opportunity = await client.salesOpportunity.findUnique({
    where: { id: opportunityId },
    select: { companyId: true, contactId: true, id: true, leadScope: true },
  });

  if (!opportunity) {
    return requiredActions.map((action) => ({
      questionId: `stage-requirement:${action}`,
      label: stageRequiredActionLabel(action),
      templateName: "Stage progression rule",
    }));
  }

  const linkedEntities = [
    { entityId: opportunity.id, entityType: "SalesOpportunity" },
    opportunity.contactId
      ? { entityId: opportunity.contactId, entityType: "Contact" }
      : null,
    opportunity.companyId
      ? { entityId: opportunity.companyId, entityType: "Company" }
      : null,
  ].filter(
    (
      entity,
    ): entity is {
      entityId: string;
      entityType: string;
    } => Boolean(entity),
  );
  const linkedTaskWhere: Prisma.TaskWhereInput[] = [];
  if (opportunity.contactId) {
    linkedTaskWhere.push({ contactId: opportunity.contactId });
  }
  if (opportunity.companyId) {
    linkedTaskWhere.push({ companyId: opportunity.companyId });
  }

  const [files, tasks, communications] = await Promise.all([
    linkedEntities.length
      ? client.fileAsset.findMany({
          where: { OR: linkedEntities },
          orderBy: { createdAt: "desc" },
          take: 80,
          select: {
            documentFolder: true,
            documentUploadType: true,
            notes: true,
            originalName: true,
            tags: true,
          },
        })
      : Promise.resolve([]),
    linkedTaskWhere.length
      ? client.task.findMany({
          where: { OR: linkedTaskWhere },
          orderBy: [{ updatedAt: "desc" }],
          take: 80,
          select: {
            description: true,
            status: true,
            title: true,
          },
        })
      : Promise.resolve([]),
    client.salesCommunication.findMany({
      where: { opportunityId },
      orderBy: { occurredAt: "desc" },
      take: 80,
      select: {
        body: true,
        direction: true,
        subject: true,
        summary: true,
      },
    }),
  ]);

  return requiredActions
    .filter(
      (action) =>
        !stageRequirementHasEvidence({
          action,
          evidence: {
            communications,
            files,
            leadScope: opportunity.leadScope,
            tasks,
          },
          requiredDocumentTypes:
            action === "required_documents_uploaded"
              ? requiredDocumentTypes
              : [],
        }),
    )
    .map((action) => ({
      questionId: `stage-requirement:${action}`,
      label:
        action === "required_documents_uploaded" && requiredDocumentTypes.length
          ? `${stageRequiredActionLabel(action)}: ${stageRequiredDocumentTypesLabel(requiredDocumentTypes)}`
          : stageRequiredActionLabel(action),
      templateName: "Stage progression rule",
    }));
}

function templateApplies({
  categoryIds,
  productIds,
  template,
}: {
  categoryIds: Set<string>;
  productIds: Set<string>;
  template: {
    scope: string;
    products: Array<{ productId: string }>;
    categories: Array<{ categoryId: string }>;
  };
}) {
  if (template.scope === "LEAD") return true;

  if (template.scope === "PRODUCT") {
    if (!template.products.length) return productIds.size > 0;
    return template.products.some((product) =>
      productIds.has(product.productId),
    );
  }

  if (template.scope === "CATEGORY") {
    if (!template.categories.length) return categoryIds.size > 0;
    return template.categories.some((category) =>
      categoryIds.has(category.categoryId),
    );
  }

  return false;
}

function hasAnswerValue(value: Prisma.JsonValue) {
  if (value === null || typeof value === "undefined") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;

  const record = value as JsonRecord;
  return Object.values(record).some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (Array.isArray(item)) return item.length > 0;
    return item !== null && typeof item !== "undefined";
  });
}

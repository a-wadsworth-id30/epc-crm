import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  documentUploadTypeDefinition,
  isDocumentUploadType,
  parseDocumentLibrarySettings,
} from "@/lib/document-library";
import { prisma } from "@/lib/prisma";
import { evaluateStageGate } from "@/lib/sales/stage-gates";
import { getCrmSettings } from "@/lib/settings";

const maxDiscoveryAnswers = 50;
const queryMode = "insensitive" as const;

const inputSchema = z
  .object({
    contactId: z.string().trim().min(1).max(128).optional(),
    leadId: z.string().trim().min(1).max(128).optional(),
    opportunityId: z.string().trim().min(1).max(128).optional(),
    query: z.string().trim().min(2).max(200).optional(),
  })
  .passthrough();

const opportunitySelect = {
  closedAt: true,
  company: {
    select: {
      id: true,
      name: true,
      status: true,
    },
  },
  companyId: true,
  contact: {
    select: {
      companyName: true,
      firstName: true,
      id: true,
      lastName: true,
      leadSource: true,
      role: true,
    },
  },
  contactId: true,
  createdAt: true,
  currency: true,
  discoveryAnswers: {
    orderBy: [{ answeredAt: "desc" }, { createdAt: "desc" }],
    take: maxDiscoveryAnswers,
    select: {
      answeredAt: true,
      category: { select: { id: true, name: true, slug: true } },
      confirmedAt: true,
      createdAt: true,
      id: true,
      product: { select: { id: true, name: true, slug: true } },
      question: {
        select: {
          answerMode: true,
          answerType: true,
          helpText: true,
          id: true,
          label: true,
          scope: true,
        },
      },
      questionAnswerModeSnapshot: true,
      questionAnswerTypeSnapshot: true,
      questionHelpTextSnapshot: true,
      questionId: true,
      questionLabelSnapshot: true,
      source: true,
      value: true,
    },
  },
  expectedCloseDate: true,
  firstContactedAt: true,
  id: true,
  lostReason: true,
  nextStep: true,
  owner: { select: { name: true } },
  probability: true,
  products: {
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 25,
    select: {
      estimatedValueCents: true,
      id: true,
      product: {
        select: {
          category: { select: { id: true, name: true, slug: true } },
          id: true,
          name: true,
          sku: true,
          slug: true,
          type: true,
        },
      },
      quantity: true,
      source: true,
      status: true,
    },
  },
  salesPipelineStage: {
    select: {
      bucket: true,
      gateMode: true,
      goal: true,
      id: true,
      name: true,
    },
  },
  salesPipelineStageId: true,
  score: true,
  source: true,
  stage: true,
  stageChangedAt: true,
  title: true,
  updatedAt: true,
  valueCents: true,
} satisfies Prisma.SalesOpportunitySelect;

type OpportunityRecord = Prisma.SalesOpportunityGetPayload<{
  select: typeof opportunitySelect;
}>;

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;

  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, maxLength) : null;
}

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function moneyValue(valueCents: number | null | undefined) {
  return valueCents ? valueCents / 100 : 0;
}

function contactName(
  contact: { firstName: string; lastName: string } | null | undefined,
) {
  return contact ? `${contact.firstName} ${contact.lastName}`.trim() : null;
}

function contains(value: string) {
  return { contains: value, mode: queryMode };
}

function queryTerms(query: string) {
  return Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((term) => term.replace(/[^\p{L}\p{N}@._+-]/gu, "").trim())
        .filter((term) => term.length >= 2)
        .slice(0, 8),
    ),
  );
}

function opportunitySearchWhere(query: string): Prisma.SalesOpportunityWhereInput {
  const terms = queryTerms(query);
  const OR: Prisma.SalesOpportunityWhereInput[] = [];

  if (query.trim().length <= 128) {
    OR.push({ id: query.trim() });
  }

  for (const term of terms) {
    OR.push(
      { title: contains(term) },
      { source: contains(term) },
      { nextStep: contains(term) },
      { company: { name: contains(term) } },
      { contact: { firstName: contains(term) } },
      { contact: { lastName: contains(term) } },
      { contact: { email: contains(term) } },
      { contact: { phone: contains(term) } },
      { contact: { additionalEmails: { some: { email: contains(term) } } } },
      { contact: { additionalPhones: { some: { phone: contains(term) } } } },
      { owner: { name: contains(term) } },
      { salesPipelineStage: { name: contains(term) } },
    );
  }

  return OR.length ? { OR } : { id: "__never__" };
}

function candidateSummary(opportunity: OpportunityRecord) {
  return {
    id: opportunity.id,
    title: opportunity.title,
    contactName: contactName(opportunity.contact),
    organisationName: opportunity.company?.name ?? opportunity.contact?.companyName ?? null,
    stage: opportunity.salesPipelineStage?.name ?? opportunity.stage,
    updatedAt: opportunity.updatedAt.toISOString(),
  };
}

function secretLikeKey(key: string) {
  return /(?:token|secret|password|passcode|credential|cookie|authorization|signature|api[_-]?key|private[_-]?key|access[_-]?token|refresh[_-]?token)/i.test(
    key,
  );
}

function safeJsonValue(value: Prisma.JsonValue | null, depth = 0): unknown {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") return cleanText(value, 1000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 4) return "[Truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => safeJsonValue(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 60)
      .map(([key, item]) => [
        key,
        secretLikeKey(key)
          ? "[Redacted]"
          : safeJsonValue((item as Prisma.JsonValue | undefined) ?? null, depth + 1),
      ]),
  );
}

function answerValueParts(value: Prisma.JsonValue | null): string[] {
  if (value === null || typeof value === "undefined") return [];
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === "string" || typeof item === "number"
          ? String(item).trim()
          : "",
      )
      .filter(Boolean);
  }

  const record = objectValue(value);
  return ["value", "values", "selected", "selectedIds", "ids"].flatMap(
    (key) =>
      answerValueParts((record[key] as Prisma.JsonValue | undefined) ?? null),
  );
}

function formatAnswerValue({
  categoryLabels,
  productLabels,
  type,
  value,
}: {
  categoryLabels: Map<string, string>;
  productLabels: Map<string, string>;
  type: string;
  value: Prisma.JsonValue | null;
}) {
  const parts = answerValueParts(value);

  if (type === "PRODUCT_SELECT" || type === "PRODUCT_MULTI_SELECT") {
    return parts.map((part) => productLabels.get(part) ?? part);
  }

  if (type === "CATEGORY_SELECT" || type === "CATEGORY_MULTI_SELECT") {
    return parts.map((part) => categoryLabels.get(part) ?? part);
  }

  return safeJsonValue(value);
}

async function resolveOpportunity(input: z.infer<typeof inputSchema>) {
  const opportunityId = input.opportunityId ?? input.leadId;

  if (opportunityId) {
    const opportunity = await prisma.salesOpportunity.findUnique({
      where: { id: opportunityId },
      select: opportunitySelect,
    });

    return {
      alternatives: [],
      matchedBy: "opportunityId",
      opportunity,
    };
  }

  if (input.contactId) {
    const opportunities = await prisma.salesOpportunity.findMany({
      where: { contactId: input.contactId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: opportunitySelect,
    });

    return {
      alternatives: opportunities.slice(1).map(candidateSummary),
      matchedBy: "contactId",
      opportunity: opportunities[0] ?? null,
    };
  }

  if (input.query) {
    const opportunities = await prisma.salesOpportunity.findMany({
      where: opportunitySearchWhere(input.query),
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 6,
      select: opportunitySelect,
    });

    return {
      alternatives: opportunities.slice(1).map(candidateSummary),
      matchedBy: "query",
      opportunity: opportunities[0] ?? null,
    };
  }

  return {
    alternatives: [],
    matchedBy: "none",
    opportunity: null,
  };
}

async function discoveryAnswerLabels(opportunity: OpportunityRecord) {
  const productIds = new Set<string>();
  const categoryIds = new Set<string>();

  for (const answer of opportunity.discoveryAnswers) {
    const answerType =
      answer.questionAnswerTypeSnapshot ?? answer.question.answerType;
    const parts = answerValueParts(answer.value);

    if (answerType === "PRODUCT_SELECT" || answerType === "PRODUCT_MULTI_SELECT") {
      parts.forEach((part) => productIds.add(part));
    }
    if (answerType === "CATEGORY_SELECT" || answerType === "CATEGORY_MULTI_SELECT") {
      parts.forEach((part) => categoryIds.add(part));
    }
  }

  const [products, categories] = await Promise.all([
    productIds.size
      ? prisma.product.findMany({
          where: { id: { in: Array.from(productIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    categoryIds.size
      ? prisma.productCategory.findMany({
          where: { id: { in: Array.from(categoryIds) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    categoryLabels: new Map(categories.map((category) => [category.id, category.name])),
    productLabels: new Map(products.map((product) => [product.id, product.name])),
  };
}

function linkedEntities(opportunity: OpportunityRecord) {
  return [
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
}

async function loadDocumentSummary(opportunity: OpportunityRecord) {
  const entities = linkedEntities(opportunity);

  if (!entities.length) return { files: [], uploadRequests: [] };

  const [files, uploadRequests] = await Promise.all([
    prisma.fileAsset.findMany({
      where: { OR: entities },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        documentFolder: true,
        documentUploadType: true,
      },
    }),
    prisma.customerUploadRequest.findMany({
      where: { OR: entities },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        completedAt: true,
        items: {
          select: {
            files: { select: { fileAssetId: true } },
            fulfilledAt: true,
            required: true,
            uploadType: true,
          },
        },
        status: true,
      },
    }),
  ]);

  return { files, uploadRequests };
}

function documentTypeLabel(value: string | null) {
  return isDocumentUploadType(value)
    ? documentUploadTypeDefinition(value)?.label ?? value
    : value;
}

function documentCounts({
  documents,
  folders,
}: {
  documents: Awaited<ReturnType<typeof loadDocumentSummary>>;
  folders: ReturnType<typeof parseDocumentLibrarySettings>["folders"];
}) {
  const folderCounts = new Map<string, number>();
  const uploadTypeCounts = new Map<string, number>();

  for (const file of documents.files) {
    folderCounts.set(
      file.documentFolder ?? "__unfiled__",
      (folderCounts.get(file.documentFolder ?? "__unfiled__") ?? 0) + 1,
    );

    if (file.documentUploadType) {
      uploadTypeCounts.set(
        file.documentUploadType,
        (uploadTypeCounts.get(file.documentUploadType) ?? 0) + 1,
      );
    }
  }

  const configuredFolders = folders
    .map((folder) => ({
      slug: folder.slug,
      name: folder.name,
      count: folderCounts.get(folder.slug) ?? 0,
    }))
    .filter((folder) => folder.count > 0);
  const unfiledCount = folderCounts.get("__unfiled__") ?? 0;

  return {
    totalCount: documents.files.length,
    folders: [
      ...configuredFolders,
      ...(unfiledCount
        ? [{ slug: null, name: "Unfiled documents", count: unfiledCount }]
        : []),
    ],
    uploadTypes: Array.from(uploadTypeCounts.entries()).map(([key, count]) => ({
      key,
      label: documentTypeLabel(key),
      count,
    })),
    uploadRequests: {
      totalCount: documents.uploadRequests.length,
      openCount: documents.uploadRequests.filter(
        (request) => request.status === "OPEN",
      ).length,
      completedCount: documents.uploadRequests.filter(
        (request) => request.status === "COMPLETED",
      ).length,
      outstandingRequiredItems: documents.uploadRequests.reduce(
        (count, request) =>
          count +
          request.items.filter(
            (item) =>
              item.required && !item.fulfilledAt && item.files.length === 0,
          ).length,
        0,
      ),
    },
  };
}

async function taskSummary(opportunity: OpportunityRecord) {
  const taskWhere: Prisma.TaskWhereInput[] = [];
  if (opportunity.contactId) taskWhere.push({ contactId: opportunity.contactId });
  if (opportunity.companyId) taskWhere.push({ companyId: opportunity.companyId });

  if (!taskWhere.length) {
    return { totalCount: 0, openCount: 0, overdueCount: 0, blockedCount: 0 };
  }

  const tasks = await prisma.task.findMany({
    where: { OR: taskWhere },
    orderBy: [{ updatedAt: "desc" }],
    take: 120,
    select: {
      dueDate: true,
      status: true,
    },
  });
  const now = Date.now();
  const openTasks = tasks.filter((task) => task.status !== "DONE");

  return {
    totalCount: tasks.length,
    openCount: openTasks.length,
    overdueCount: openTasks.filter(
      (task) => task.dueDate && task.dueDate.getTime() < now,
    ).length,
    blockedCount: openTasks.filter((task) => task.status === "BLOCKED").length,
  };
}

export async function getMcpDiscoveryPack(args: unknown) {
  const parsed = inputSchema.safeParse(objectValue(args));

  if (
    !parsed.success ||
    (!parsed.data.opportunityId &&
      !parsed.data.leadId &&
      !parsed.data.contactId &&
      !parsed.data.query)
  ) {
    throw new Error(
      "Discovery pack requires a leadId, opportunityId, contactId or query.",
    );
  }

  const resolved = await resolveOpportunity(parsed.data);
  const generatedAt = new Date().toISOString();

  if (!resolved.opportunity) {
    return {
      ok: true,
      source: "crm-mcp-discovery-pack",
      generatedAt,
      found: false,
      lookup: {
        matchedBy: resolved.matchedBy,
        query: parsed.data.query ?? null,
        leadId: parsed.data.leadId ?? parsed.data.opportunityId ?? null,
        contactId: parsed.data.contactId ?? null,
      },
      message: "No matching lead or opportunity was found.",
      alternatives: resolved.alternatives,
    };
  }

  const opportunity = resolved.opportunity;
  const settings = await getCrmSettings();
  const documentLibrary = parseDocumentLibrarySettings(settings.documentLibrary);
  const [{ categoryLabels, productLabels }, documents, tasks, stageGate] =
    await Promise.all([
      discoveryAnswerLabels(opportunity),
      loadDocumentSummary(opportunity),
      taskSummary(opportunity),
      evaluateStageGate({
        client: prisma,
        opportunityId: opportunity.id,
        salesPipelineStageId: opportunity.salesPipelineStageId,
      }),
    ]);
  const answeredCount = opportunity.discoveryAnswers.filter(
    (answer) => answer.value !== null,
  ).length;
  const confirmedCount = opportunity.discoveryAnswers.filter(
    (answer) => answer.confirmedAt,
  ).length;

  return {
    ok: true,
    source: "crm-mcp-discovery-pack",
    generatedAt,
    found: true,
    lookup: {
      matchedBy: resolved.matchedBy,
      query: parsed.data.query ?? null,
      leadId: parsed.data.leadId ?? parsed.data.opportunityId ?? null,
      contactId: parsed.data.contactId ?? null,
      alternatives: resolved.alternatives,
    },
    privacy: {
      omittedFields: [
        "contact email",
        "contact phone",
        "full address",
        "document filenames",
        "document notes",
        "document tags",
        "uploader identity",
        "communication content",
        "raw attribution payloads",
      ],
    },
    lead: {
      id: opportunity.id,
      title: opportunity.title,
      href: `/sales/${opportunity.id}`,
      stage: opportunity.stage,
      pipelineStage: opportunity.salesPipelineStage
        ? {
            id: opportunity.salesPipelineStage.id,
            name: opportunity.salesPipelineStage.name,
            bucket: opportunity.salesPipelineStage.bucket,
            gateMode: opportunity.salesPipelineStage.gateMode,
            goal: opportunity.salesPipelineStage.goal,
          }
        : null,
      owner: opportunity.owner?.name ?? null,
      value: moneyValue(opportunity.valueCents),
      valueCents: opportunity.valueCents,
      currency: opportunity.currency,
      probability: opportunity.probability,
      source: opportunity.source,
      nextStep: cleanText(opportunity.nextStep, 240),
      expectedCloseDate: isoDate(opportunity.expectedCloseDate),
      score: opportunity.score,
      firstContactedAt: isoDate(opportunity.firstContactedAt),
      stageChangedAt: opportunity.stageChangedAt.toISOString(),
      closedAt: isoDate(opportunity.closedAt),
      lostReason: opportunity.lostReason,
      createdAt: opportunity.createdAt.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
    },
    contact: opportunity.contact
      ? {
          id: opportunity.contact.id,
          name: contactName(opportunity.contact),
          href: `/contacts/${opportunity.contact.id}`,
          role: opportunity.contact.role,
          leadSource: opportunity.contact.leadSource,
        }
      : null,
    organisation: opportunity.company
      ? {
          id: opportunity.company.id,
          name: opportunity.company.name,
          href: `/clients/${opportunity.company.id}`,
          status: opportunity.company.status,
        }
      : opportunity.contact?.companyName
        ? {
            id: null,
            name: opportunity.contact.companyName,
            href: null,
            status: null,
          }
        : null,
    products: opportunity.products.map((item) => ({
      id: item.id,
      productId: item.product.id,
      name: item.product.name,
      sku: item.product.sku,
      type: item.product.type,
      category: item.product.category
        ? {
            id: item.product.category.id,
            name: item.product.category.name,
            slug: item.product.category.slug,
          }
        : null,
      status: item.status,
      quantity: item.quantity,
      estimatedValue: moneyValue(item.estimatedValueCents),
      estimatedValueCents: item.estimatedValueCents,
      source: item.source,
    })),
    discovery: {
      answerCount: answeredCount,
      confirmedCount,
      returnedAnswerCount: opportunity.discoveryAnswers.length,
      answers: opportunity.discoveryAnswers.map((answer) => {
        const answerType =
          answer.questionAnswerTypeSnapshot ?? answer.question.answerType;

        return {
          id: answer.id,
          questionId: answer.questionId,
          question: answer.questionLabelSnapshot ?? answer.question.label,
          helpText: cleanText(
            answer.questionHelpTextSnapshot ?? answer.question.helpText,
            240,
          ),
          answerType,
          answerMode:
            answer.questionAnswerModeSnapshot ?? answer.question.answerMode,
          scope: answer.question.scope,
          value: formatAnswerValue({
            categoryLabels,
            productLabels,
            type: answerType,
            value: answer.value,
          }),
          product: answer.product
            ? {
                id: answer.product.id,
                name: answer.product.name,
                slug: answer.product.slug,
              }
            : null,
          category: answer.category
            ? {
                id: answer.category.id,
                name: answer.category.name,
                slug: answer.category.slug,
              }
            : null,
          source: answer.source,
          answeredAt: isoDate(answer.answeredAt ?? answer.createdAt),
          confirmedAt: isoDate(answer.confirmedAt),
        };
      }),
    },
    documents: documentCounts({
      documents,
      folders: documentLibrary.folders,
    }),
    stageGate: {
      mode: stageGate.mode,
      passed: stageGate.passed,
      missingCount: stageGate.missing.length,
      missing: stageGate.missing.slice(0, 20),
    },
    tasks,
  };
}

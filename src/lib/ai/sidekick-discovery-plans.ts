import "server-only";

import { Prisma, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateProductDiscoveryObjectData } from "@/lib/object-data/products-discovery";

type SidekickPlanUser = {
  id: string;
  role: UserRole;
};

type PlannedQuestion = {
  label: string;
  slug: string;
  helpText?: string | null;
  scope: "OPPORTUNITY" | "PRODUCT" | "CATEGORY" | "LINE_ITEM";
  answerType:
    | "TEXT"
    | "LONG_TEXT"
    | "URL"
    | "BOOLEAN"
    | "SINGLE_SELECT"
    | "MULTI_SELECT"
    | "PRODUCT_SELECT"
    | "PRODUCT_MULTI_SELECT"
    | "CATEGORY_SELECT"
    | "CATEGORY_MULTI_SELECT"
    | "NUMBER"
    | "DATE"
    | "DATETIME"
    | "CURRENCY";
  answerMode: "SINGLE" | "MULTIPLE_MAX" | "MULTIPLE_UNLIMITED";
  required: boolean;
  options?: string[];
  dedupeKey: string;
};

type DiscoveryPackPlan = {
  kind: "discovery_pack";
  template: {
    name: string;
    slug: string;
    scope: "LEAD" | "PRODUCT" | "CATEGORY";
    description: string;
  };
  questions: PlannedQuestion[];
  safety: {
    destructiveActions: false;
    requiresApproval: true;
    preservesHistoricalAnswers: true;
  };
  replaceQuestions?: boolean;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromPrompt(prompt: string) {
  const quoted = prompt.match(/["“']([^"”']{2,80})["”']/)?.[1]?.trim();
  if (quoted) return toTitle(quoted);

  const explicitPack = prompt.match(
    /\b(?:make|create|build|implement)\s+(.{2,80}?)\s+(?:the\s+)?(?:first\s+)?(?:discovery|question|qualification)\s+(?:pack|group|template)?\b/i,
  )?.[1]?.trim();
  if (explicitPack) return toTitle(cleanTitle(explicitPack));

  const lower = prompt.toLowerCase();
  const afterFor = prompt.match(/\bfor\s+(.+)$/i)?.[1]?.trim();
  const base = afterFor || prompt;
  const cleaned = cleanTitle(base);

  if (cleaned) return toTitle(cleaned).slice(0, 80);
  if (lower.includes("ecommerce")) return "Ecommerce";
  if (lower.includes("brand")) return "Branding";
  return "Discovery";
}

function cleanTitle(value: string) {
  return value
    .replace(/\b(create|build|make|generate|research|implement|discovery|question|pack|questions|the|first|in|lead|product|category|following|with|have|has|want|to|it)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitle(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function templateNameFromTitle(title: string) {
  return /\b(discovery|qualification|question pack)\b/i.test(title)
    ? title
    : `${title} discovery`;
}

function stripQuestionTypeHint(value: string) {
  const match = value.match(/\s*\(([^)]{2,80})\)\s*$/);
  return {
    label: (match ? value.slice(0, match.index).trim() : value.trim()).replace(/[?.:]+$/g, ""),
    typeHint: match?.[1]?.trim() ?? "",
  };
}

function inferQuestionShape(label: string, typeHint: string) {
  const haystack = `${label} ${typeHint}`.toLowerCase();

  if (haystack.includes("budget") && /\b(range|£|gbp|currency|money|value)\b/.test(haystack)) {
    return {
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture the customer's expected project budget range.",
      options: ["Under £2,500", "£2,500-£5,000", "£5,000-£10,000", "£10,000-£20,000", "£20,000+"],
    };
  }

  if (haystack.includes("timeframe") || haystack.includes("timeline")) {
    return {
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture the customer's desired project timing.",
      options: ["ASAP", "Within 1 month", "1-3 months", "3-6 months", "6+ months", "Not sure"],
    };
  }

  if (/\bdate\s*time|datetime|date\/time|contact date/.test(haystack)) {
    return {
      answerType: "DATETIME" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture the preferred initial contact slot.",
    };
  }

  if (/\bdate\b/.test(haystack)) {
    return {
      answerType: "DATE" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture the relevant date.",
    };
  }

  if (haystack.includes("dropdown") || haystack.includes("select")) {
    return {
      answerType: "SINGLE_SELECT" as const,
      answerMode: "SINGLE" as const,
      helpText: "Select the best matching option.",
      options: ["To confirm", "Option 1", "Option 2"],
    };
  }

  if (haystack.includes("notes") || haystack.includes("details") || haystack.includes("description")) {
    return {
      answerType: "LONG_TEXT" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture useful context for the discovery call and quote.",
    };
  }

  if (haystack.includes("number")) {
    return {
      answerType: "NUMBER" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture a numeric answer.",
    };
  }

  if (haystack.includes("url") || haystack.includes("website")) {
    return {
      answerType: "URL" as const,
      answerMode: "SINGLE" as const,
      helpText: "Capture the relevant URL.",
    };
  }

  return {
    answerType: typeHint.toLowerCase().includes("text") ? ("TEXT" as const) : ("LONG_TEXT" as const),
    answerMode: "SINGLE" as const,
    helpText: "Capture the customer's answer.",
  };
}

function requestedQuestionsFromPrompt({
  prompt,
  questionBase,
  questionScope,
}: {
  prompt: string;
  questionBase: string;
  questionScope: PlannedQuestion["scope"];
}) {
  const rows = Array.from(
    prompt.matchAll(/(?:^|\n)\s*\d+\s*[\).:-]\s*([^\n]+)/g),
  ).map((match) => match[1]?.trim()).filter(Boolean);

  if (!rows.length) return null;

  return rows.map((row, index) => {
    const { label, typeHint } = stripQuestionTypeHint(row);
    const shape = inferQuestionShape(label, typeHint);
    const slug = `${questionBase}-${slugify(label) || `question-${index + 1}`}`;

    return {
      answerMode: shape.answerMode,
      answerType: shape.answerType,
      dedupeKey: slug,
      helpText: shape.helpText,
      label,
      options: "options" in shape ? shape.options : undefined,
      required: !/notes?/i.test(label),
      scope: questionScope,
      slug,
    };
  });
}

export async function createSidekickDiscoveryPackPlan({
  prompt,
  user,
}: {
  prompt: string;
  user: SidekickPlanUser;
}) {
  const title = titleFromPrompt(prompt);
  const templateName = templateNameFromTitle(title);
  const slug = slugify(templateName) || "sidekick-discovery";
  const scope = /\b(category|categories)\b/i.test(prompt)
    ? "CATEGORY"
    : /\b(lead|general|qualification|scope)\b/i.test(prompt)
      ? "LEAD"
      : "PRODUCT";
  const questionScope =
    scope === "LEAD" ? "OPPORTUNITY" : scope === "CATEGORY" ? "CATEGORY" : "PRODUCT";
  const questionBase = slugify(title) || "sidekick";
  const requestedQuestions = requestedQuestionsFromPrompt({
    prompt,
    questionBase,
    questionScope,
  });
  const plan: DiscoveryPackPlan = {
    kind: "discovery_pack",
    template: {
      name: templateName,
      slug,
      scope,
      description: `Sidekick proposed Discovery pack for ${title}.`,
    },
    replaceQuestions:
      Boolean(requestedQuestions?.length) &&
      /\b(have|has|with)\s+(?:the\s+)?following questions\b/i.test(prompt),
    questions: requestedQuestions ?? [
      {
        label: `What is the main objective for ${title}?`,
        slug: `${questionBase}-objective`,
        helpText: "Capture the outcome the customer needs this work to deliver.",
        scope: questionScope,
        answerType: "LONG_TEXT",
        answerMode: "SINGLE",
        required: true,
        dedupeKey: `${questionBase}-objective`,
      },
      {
        label: `What does the customer already have in place for ${title}?`,
        slug: `${questionBase}-current-position`,
        helpText: "Existing systems, suppliers, assets, URLs or operational constraints.",
        scope: questionScope,
        answerType: "LONG_TEXT",
        answerMode: "SINGLE",
        required: false,
        dedupeKey: `${questionBase}-current-position`,
      },
      {
        label: `What constraints or must-haves apply to ${title}?`,
        slug: `${questionBase}-constraints`,
        helpText: "Capture technical, timing, compliance, budget or stakeholder constraints.",
        scope: questionScope,
        answerType: "LONG_TEXT",
        answerMode: "SINGLE",
        required: true,
        dedupeKey: `${questionBase}-constraints`,
      },
      {
        label: `What does success look like for ${title}?`,
        slug: `${questionBase}-success`,
        helpText: "Use this to guide quoting, proposal and delivery priorities.",
        scope: questionScope,
        answerType: "LONG_TEXT",
        answerMode: "SINGLE",
        required: true,
        dedupeKey: `${questionBase}-success`,
      },
    ],
    safety: {
      destructiveActions: false,
      preservesHistoricalAnswers: true,
      requiresApproval: true,
    },
  };

  const writePlan = await prisma.sidekickWritePlan.create({
    data: {
      createdByUserId: user.id,
      plan: plan as unknown as Prisma.InputJsonValue,
      prompt,
      summary: `${plan.replaceQuestions ? "Update" : "Create"} ${templateName} with ${plan.questions.length} questions.`,
      type: "DISCOVERY_PACK",
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "sidekick.discovery_plan.created",
      actorId: user.id,
      entity: "SidekickWritePlan",
      entityId: writePlan.id,
      metadata: {
        prompt,
        summary: writePlan.summary,
      },
    },
  });

  return {
    id: writePlan.id,
    plan,
    summary: writePlan.summary,
  };
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plannedQuestions(value: unknown): PlannedQuestion[] {
  const data = jsonObject(value);
  const rows = Array.isArray(data.questions) ? data.questions : [];

  return rows.flatMap((row) => {
    const question = jsonObject(row);
    const label = stringValue(question.label);
    const slug = stringValue(question.slug);
    const dedupeKey = stringValue(question.dedupeKey) ?? slug;
    const scope = stringValue(question.scope);
    const answerType = stringValue(question.answerType);
    const answerMode = stringValue(question.answerMode);

    if (!label || !slug || !dedupeKey || !scope || !answerType || !answerMode) {
      return [];
    }

    return [
      {
        answerMode,
        answerType,
        dedupeKey,
        helpText: stringValue(question.helpText),
        label,
        options: Array.isArray(question.options)
          ? question.options.map(String).filter(Boolean)
          : undefined,
        required: question.required === true,
        scope,
        slug,
      } as PlannedQuestion,
    ];
  });
}

export async function applySidekickDiscoveryPackPlan({
  planId,
  user,
}: {
  planId: string;
  user: SidekickPlanUser;
}) {
  if (user.role !== "ADMIN") {
    throw new Error("Only admins can apply Sidekick write plans.");
  }

  const writePlan = await prisma.sidekickWritePlan.findUnique({
    where: { id: planId },
  });

  if (!writePlan) throw new Error("Sidekick write plan not found.");
  if (writePlan.type !== "DISCOVERY_PACK") {
    throw new Error("This write plan type is not supported.");
  }
  if (writePlan.status !== "DRAFT" && writePlan.status !== "APPROVED") {
    throw new Error("This write plan has already been handled.");
  }

  const plan = jsonObject(writePlan.plan);
  if (plan.kind !== "discovery_pack") {
    throw new Error("Invalid Discovery pack plan.");
  }

  const template = jsonObject(plan.template);
  const templateName = stringValue(template.name);
  const templateSlug = stringValue(template.slug);
  const templateScope = stringValue(template.scope);
  const replaceQuestions = plan.replaceQuestions === true;
  const questions = plannedQuestions(plan);

  if (!templateName || !templateSlug || !templateScope || !questions.length) {
    throw new Error("The Discovery pack plan is incomplete.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const savedTemplate = await tx.discoveryTemplate.upsert({
        where: { slug: templateSlug },
        update: {
          description: stringValue(template.description),
          isActive: true,
          name: templateName,
          scope: templateScope as "LEAD" | "PRODUCT" | "CATEGORY",
        },
        create: {
          description: stringValue(template.description),
          isActive: true,
          name: templateName,
          scope: templateScope as "LEAD" | "PRODUCT" | "CATEGORY",
          slug: templateSlug,
        },
        select: { id: true },
      });

      const savedQuestions = [];
      for (const question of questions) {
        const savedQuestion = await tx.discoveryQuestion.upsert({
          where: { slug: question.slug },
          update: {
            defaultRequired: question.required,
            dedupeKey: question.dedupeKey,
            helpText: question.helpText ?? null,
            isActive: true,
            label: question.label,
            metadata: {
              sidekickPlanId: writePlan.id,
            },
            options: question.options?.length
              ? (question.options as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
          create: {
            answerMode: question.answerMode,
            answerType: question.answerType,
            defaultRequired: question.required,
            dedupeKey: question.dedupeKey,
            helpText: question.helpText ?? null,
            isActive: true,
            label: question.label,
            metadata: {
              sidekickPlanId: writePlan.id,
            },
            options: question.options?.length
              ? (question.options as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            scope: question.scope,
            slug: question.slug,
          },
          select: { id: true },
        });
        savedQuestions.push(savedQuestion);
      }

      await tx.discoveryTemplateQuestion.createMany({
        data: savedQuestions.map((question, index) => ({
          questionId: question.id,
          required: questions[index]?.required ?? false,
          sortOrder: (index + 1) * 10,
          templateId: savedTemplate.id,
        })),
        skipDuplicates: true,
      });

      if (replaceQuestions) {
        await tx.discoveryTemplateQuestion.deleteMany({
          where: {
            templateId: savedTemplate.id,
            questionId: {
              notIn: savedQuestions.map((question) => question.id),
            },
          },
        });
      }

      await tx.sidekickWritePlan.update({
        where: { id: writePlan.id },
        data: {
          appliedAt: new Date(),
          approvedAt: new Date(),
          approvedByUserId: user.id,
          status: "APPLIED",
        },
      });

      return {
        questionCount: savedQuestions.length,
        templateId: savedTemplate.id,
      };
    });

    await prisma.auditLog.create({
      data: {
        action: "sidekick.discovery_plan.applied",
        actorId: user.id,
        entity: "SidekickWritePlan",
        entityId: writePlan.id,
        metadata: result,
      },
    });

    revalidateProductDiscoveryObjectData();

    return result;
  } catch (error) {
    await prisma.sidekickWritePlan.update({
      where: { id: writePlan.id },
      data: {
        failureMessage: error instanceof Error ? error.message : "Plan failed.",
        status: "FAILED",
      },
    });
    throw error;
  }
}

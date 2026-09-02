import "server-only";

import type { Prisma, SalesStage } from "@prisma/client";
import { z } from "zod";
import type { CurrentUser } from "@/lib/auth";
import {
  contactCategoryLabel,
  contactCategoryValues,
} from "@/lib/contacts/categories";
import {
  contactWhereWithAccess,
  salesOpportunityWhereWithAccess,
} from "@/lib/crm-resource-access";
import { getOpenAIRuntimeConfig } from "@/lib/integrations/openai";
import { prisma } from "@/lib/prisma";

const maxSegmentPromptChars = 1200;
const segmentStages = [
  "LEAD",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

const baseRuleSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

const segmentRuleSchema = z.discriminatedUnion("type", [
  baseRuleSchema.extend({
    type: z.literal("contact_created_within_days"),
    days: z.coerce.number().int().min(1).max(3650),
  }),
  baseRuleSchema.extend({
    type: z.literal("contact_updated_within_days"),
    days: z.coerce.number().int().min(1).max(3650),
  }),
  baseRuleSchema.extend({
    type: z.literal("opportunity_created_within_days"),
    days: z.coerce.number().int().min(1).max(3650),
  }),
  baseRuleSchema.extend({
    type: z.literal("opportunity_stage_in"),
    values: z.array(z.enum(segmentStages)).min(1).max(8),
  }),
  baseRuleSchema.extend({
    type: z.literal("contact_category_in"),
    values: z.array(z.enum(contactCategoryValues)).min(1).max(4),
  }),
  baseRuleSchema.extend({
    type: z.literal("product_name_contains"),
    value: z.string().trim().min(1).max(80),
    opportunityCreatedWithinDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .optional(),
  }),
  baseRuleSchema.extend({
    type: z.literal("product_category_contains"),
    value: z.string().trim().min(1).max(80),
    opportunityCreatedWithinDays: z.coerce
      .number()
      .int()
      .min(1)
      .max(3650)
      .optional(),
  }),
  baseRuleSchema.extend({
    type: z.literal("role_contains"),
    value: z.string().trim().min(1).max(80),
  }),
  baseRuleSchema.extend({
    type: z.literal("company_name_contains"),
    value: z.string().trim().min(1).max(80),
  }),
  baseRuleSchema.extend({
    type: z.literal("tag_in"),
    values: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  }),
  baseRuleSchema.extend({
    type: z.literal("has_email"),
    value: z.boolean(),
  }),
  baseRuleSchema.extend({
    type: z.literal("has_phone"),
    value: z.boolean(),
  }),
]);

export const contactSegmentCriteriaSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(segmentRuleSchema).min(1).max(12),
});

export type ContactSegmentCriteria = z.infer<
  typeof contactSegmentCriteriaSchema
>;
export type ContactSegmentRule = ContactSegmentCriteria["rules"][number];

const aiSegmentPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  summary: z.string().trim().min(1).max(320),
  criteria: contactSegmentCriteriaSchema,
});

export type ContactSegmentDraft = z.infer<typeof aiSegmentPlanSchema> & {
  mode: "fallback" | "openai";
  note?: string | null;
  matchCount: number;
};

const segmentPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "summary", "criteria"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: ["string", "null"], maxLength: 240 },
    summary: { type: "string", minLength: 1, maxLength: 320 },
    criteria: {
      type: "object",
      additionalProperties: false,
      required: ["match", "rules"],
      properties: {
        match: { type: "string", enum: ["all", "any"] },
        rules: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            anyOf: [
              ruleSchema("contact_created_within_days", {
                days: { type: "integer", minimum: 1, maximum: 3650 },
              }),
              ruleSchema("contact_updated_within_days", {
                days: { type: "integer", minimum: 1, maximum: 3650 },
              }),
              ruleSchema("opportunity_created_within_days", {
                days: { type: "integer", minimum: 1, maximum: 3650 },
              }),
              ruleSchema("opportunity_stage_in", {
                values: {
                  type: "array",
                  minItems: 1,
                  maxItems: 8,
                  items: { type: "string", enum: [...segmentStages] },
                },
              }),
              ruleSchema("contact_category_in", {
                values: {
                  type: "array",
                  minItems: 1,
                  maxItems: 4,
                  items: { type: "string", enum: [...contactCategoryValues] },
                },
              }),
              ruleSchema("product_name_contains", {
                value: { type: "string", minLength: 1, maxLength: 80 },
                opportunityCreatedWithinDays: {
                  type: "integer",
                  minimum: 1,
                  maximum: 3650,
                },
              }),
              ruleSchema("product_category_contains", {
                value: { type: "string", minLength: 1, maxLength: 80 },
                opportunityCreatedWithinDays: {
                  type: "integer",
                  minimum: 1,
                  maximum: 3650,
                },
              }),
              ruleSchema("role_contains", {
                value: { type: "string", minLength: 1, maxLength: 80 },
              }),
              ruleSchema("company_name_contains", {
                value: { type: "string", minLength: 1, maxLength: 80 },
              }),
              ruleSchema("tag_in", {
                values: {
                  type: "array",
                  minItems: 1,
                  maxItems: 20,
                  items: { type: "string", minLength: 1, maxLength: 40 },
                },
              }),
              ruleSchema("has_email", {
                value: { type: "boolean" },
              }),
              ruleSchema("has_phone", {
                value: { type: "boolean" },
              }),
            ],
          },
        },
      },
    },
  },
};

function ruleSchema(
  type: ContactSegmentRule["type"],
  properties: Record<string, unknown>,
) {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "type",
      "label",
      ...Object.keys(properties).filter(
        (key) => key !== "opportunityCreatedWithinDays",
      ),
    ],
    properties: {
      type: { type: "string", const: type },
      label: { type: "string", minLength: 1, maxLength: 120 },
      ...properties,
    },
  };
}

export function parseContactSegmentCriteria(value: unknown) {
  return contactSegmentCriteriaSchema.safeParse(value);
}

function daysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function contains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

function opportunityWindow(
  days: number | undefined,
): Prisma.SalesOpportunityWhereInput {
  return days ? { createdAt: { gte: daysAgo(days) } } : {};
}

function accessibleOpportunityWhere(
  where: Prisma.SalesOpportunityWhereInput,
  user?: CurrentUser,
) {
  return user ? salesOpportunityWhereWithAccess(user, where) : where;
}

function ruleToWhere(
  rule: ContactSegmentRule,
  user?: CurrentUser,
): Prisma.ContactWhereInput {
  switch (rule.type) {
    case "contact_created_within_days":
      return { createdAt: { gte: daysAgo(rule.days) } };
    case "contact_updated_within_days":
      return { updatedAt: { gte: daysAgo(rule.days) } };
    case "opportunity_created_within_days":
      return {
        opportunities: {
          some: accessibleOpportunityWhere(
            { createdAt: { gte: daysAgo(rule.days) } },
            user,
          ),
        },
      };
    case "opportunity_stage_in":
      return {
        opportunities: {
          some: accessibleOpportunityWhere(
            { stage: { in: rule.values as SalesStage[] } },
            user,
          ),
        },
      };
    case "contact_category_in":
      return { category: { in: rule.values } };
    case "product_name_contains":
      return {
        opportunities: {
          some: accessibleOpportunityWhere(
            {
              ...opportunityWindow(rule.opportunityCreatedWithinDays),
              products: { some: { product: { name: contains(rule.value) } } },
            },
            user,
          ),
        },
      };
    case "product_category_contains":
      return {
        opportunities: {
          some: accessibleOpportunityWhere(
            {
              ...opportunityWindow(rule.opportunityCreatedWithinDays),
              products: {
                some: {
                  product: {
                    OR: [
                      { category: { name: contains(rule.value) } },
                      {
                        categoryAssignments: {
                          some: { category: { name: contains(rule.value) } },
                        },
                      },
                    ],
                  },
                },
              },
            },
            user,
          ),
        },
      };
    case "role_contains":
      return { role: contains(rule.value) };
    case "company_name_contains":
      return {
        OR: [
          { companyName: contains(rule.value) },
          { company: { name: contains(rule.value) } },
        ],
      };
    case "tag_in":
      return {
        tagAssignments: {
          some: { tag: { name: { in: rule.values, mode: "insensitive" } } },
        },
      };
    case "has_email":
      return rule.value
        ? { email: { not: null } }
        : { OR: [{ email: null }, { email: "" }] };
    case "has_phone":
      return rule.value
        ? { phone: { not: null } }
        : { OR: [{ phone: null }, { phone: "" }] };
  }
}

export function contactWhereForSegment(
  criteria: ContactSegmentCriteria,
  user?: CurrentUser,
): Prisma.ContactWhereInput {
  const rules = criteria.rules.map((rule) => ruleToWhere(rule, user));
  const segmentWhere =
    criteria.match === "any" ? { OR: rules } : { AND: rules };

  return user ? contactWhereWithAccess(user, segmentWhere) : segmentWhere;
}

export async function countContactsForSegment(
  criteria: ContactSegmentCriteria,
  user?: CurrentUser,
) {
  return prisma.contact.count({
    where: contactWhereForSegment(criteria, user),
  });
}

export function ruleLabel(rule: ContactSegmentRule) {
  return rule.label;
}

function extractQuotedPhrase(prompt: string) {
  return prompt.match(/["']([^"']+)["']/)?.[1]?.trim() ?? null;
}

function timeframeDays(prompt: string) {
  const lower = prompt.toLowerCase();
  const number = lower.match(
    /last\s+(\d+)\s+(day|days|week|weeks|month|months|year|years)/,
  );

  if (number) {
    const amount = Number(number[1]);
    const unit = number[2];
    if (unit.startsWith("day")) return amount;
    if (unit.startsWith("week")) return amount * 7;
    if (unit.startsWith("month")) return amount * 31;
    if (unit.startsWith("year")) return amount * 365;
  }

  if (lower.includes("last year") || lower.includes("past year")) return 365;
  if (lower.includes("last 12 months") || lower.includes("past 12 months"))
    return 365;
  if (lower.includes("last 6 months") || lower.includes("past 6 months"))
    return 186;
  if (lower.includes("last 90 days") || lower.includes("past 90 days"))
    return 90;
  if (lower.includes("last month") || lower.includes("past month")) return 31;
  return null;
}

function cleanSubject(prompt: string) {
  return prompt
    .replace(
      /people|contacts|companies|customers|that|who|have|has|with|in the last \d+ \w+|over the last \d+ \w+|past \d+ \w+|last \d+ \w+/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicSegmentPlan(prompt: string) {
  const lower = prompt.toLowerCase();
  const days = timeframeDays(prompt);
  const quotedPhrase = extractQuotedPhrase(prompt);
  const fallbackPhrase = cleanSubject(prompt);
  const productPhrase =
    quotedPhrase ??
    (lower.includes("digital marketing")
      ? "digital marketing"
      : fallbackPhrase || "recent activity");
  const rules: ContactSegmentRule[] = [];

  if (lower.includes("email")) {
    rules.push({
      type: "has_email",
      value: true,
      label: "Has an email address",
    });
  }

  if (lower.includes("phone") || lower.includes("telephone")) {
    rules.push({
      type: "has_phone",
      value: true,
      label: "Has a phone number",
    });
  }

  const categoryValues = contactCategoryValues.filter((category) => {
    const label = contactCategoryLabel(category).toLowerCase();
    return (
      lower.includes(label) ||
      lower.includes(label.replace(/y$/, "ies")) ||
      (category === "TRADE" && lower.includes("trades")) ||
      (category === "INSTALLER" && lower.includes("installers")) ||
      (category === "COMPANY" &&
        (lower.includes("companies") ||
          lower.includes("organisation") ||
          lower.includes("organization") ||
          lower.includes("supplier")))
    );
  });

  if (categoryValues.length) {
    rules.push({
      type: "contact_category_in",
      values: categoryValues,
      label: `Category is ${categoryValues
        .map((category) => contactCategoryLabel(category))
        .join(" or ")}`,
    });
  }

  if (lower.includes("won")) {
    rules.push({
      type: "opportunity_stage_in",
      values: ["WON"],
      label: "Has a won sale",
    });
  } else if (lower.includes("open lead") || lower.includes("active lead")) {
    rules.push({
      type: "opportunity_stage_in",
      values: ["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION"],
      label: "Has an open lead",
    });
  }

  if (
    lower.includes("product") ||
    lower.includes("service") ||
    lower.includes("started") ||
    lower.includes("bought") ||
    lower.includes("purchased") ||
    lower.includes("digital marketing")
  ) {
    rules.push({
      type: "product_name_contains",
      value: productPhrase,
      opportunityCreatedWithinDays: days ?? undefined,
      label: days
        ? `Product or service contains "${productPhrase}" in the last ${days} days`
        : `Product or service contains "${productPhrase}"`,
    });
  }

  if (!rules.length && days) {
    rules.push({
      type: "contact_created_within_days",
      days,
      label: `Contact created in the last ${days} days`,
    });
  }

  if (!rules.length) {
    rules.push({
      type: "opportunity_created_within_days",
      days: 365,
      label: "Has a lead created in the last 12 months",
    });
  }

  const criteria = contactSegmentCriteriaSchema.parse({
    match: "all",
    rules,
  });

  return {
    name: titleFromPrompt(prompt),
    description: `Contacts matching: ${prompt.slice(0, 180)}`,
    summary:
      "Built from deterministic CRM rules. Review the criteria before saving.",
    criteria,
  };
}

function titleFromPrompt(prompt: string) {
  const cleaned = prompt
    .replace(/^(show me|find|create|segment|people|contacts|customers)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = cleaned || "New contact segment";

  return title.charAt(0).toUpperCase() + title.slice(1, 80);
}

function extractOutputText(
  payload: {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
  } | null,
) {
  return (
    payload?.output_text ??
    payload?.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n") ??
    ""
  );
}

export async function buildContactSegmentDraft(
  prompt: string,
  user: CurrentUser,
): Promise<ContactSegmentDraft> {
  const cleanPrompt = prompt.trim().slice(0, maxSegmentPromptChars);

  if (!cleanPrompt) {
    throw new Error("Describe the segment you want to build.");
  }

  const fallback = deterministicSegmentPlan(cleanPrompt);
  const config = await getOpenAIRuntimeConfig({
    modelField: "defaultModel",
    envModelKey: "OPENAI_SEGMENT_BUILDER_MODEL",
  });

  if (!config.apiKey) {
    return {
      ...fallback,
      mode: "fallback",
      note: "OpenAI is not configured, so deterministic rules were used.",
      matchCount: await countContactsForSegment(fallback.criteria, user),
    };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content:
            "You translate CRM contact segment requests into safe structured criteria. Use only the allowed rule types. Prefer conservative rules. Do not generate SQL. Use contact_category_in for Consumer, Trade, Installer or Company contact type requests. If the user mentions a service/product such as digital marketing, use product_name_contains. If they mention a period, put it on opportunityCreatedWithinDays when product purchase/start context is implied. Return JSON only.",
        },
        {
          role: "user",
          content: cleanPrompt,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "contact_segment_plan",
          strict: true,
          schema: segmentPlanJsonSchema,
        },
      },
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string }> }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    return {
      ...fallback,
      mode: "fallback",
      note: payload?.error?.message ?? "OpenAI could not build this segment.",
      matchCount: await countContactsForSegment(fallback.criteria, user),
    };
  }

  let rawPlan: unknown = null;

  try {
    rawPlan = JSON.parse(extractOutputText(payload) || "{}");
  } catch {
    rawPlan = null;
  }

  const parsed = aiSegmentPlanSchema.safeParse(rawPlan);

  if (!parsed.success) {
    return {
      ...fallback,
      mode: "fallback",
      note: "OpenAI returned a plan outside the supported segment rules.",
      matchCount: await countContactsForSegment(fallback.criteria, user),
    };
  }

  return {
    ...parsed.data,
    mode: "openai",
    note: null,
    matchCount: await countContactsForSegment(parsed.data.criteria, user),
  };
}

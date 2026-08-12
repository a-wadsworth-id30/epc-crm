import "server-only";

import { normaliseLeadScope } from "@/lib/sales/lead-scope";

type OpportunityForConditions = {
  leadScope: unknown;
  score: number;
  source: string | null;
  stageChangedAt: Date;
  title: string;
};

export type AutomationConditionResult = {
  matched: boolean;
  reason: string | null;
};

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function daysSince(value: Date) {
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 86_400_000));
}

function includesNeedle(haystack: string, needle: string | null) {
  if (!needle) return true;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function evaluateAutomationConditions(
  config: Record<string, unknown>,
  opportunity: OpportunityForConditions,
): AutomationConditionResult {
  const conditions = objectValue(config.conditions);
  const minScore = numberValue(conditions.minScore);
  const maxScore = numberValue(conditions.maxScore);
  const minStageAgeDays = numberValue(conditions.minStageAgeDays);
  const maxStageAgeDays = numberValue(conditions.maxStageAgeDays);
  const sourceIncludes = stringValue(conditions.sourceIncludes);
  const serviceIncludes = stringValue(conditions.serviceIncludes);
  const stageAgeDays = daysSince(opportunity.stageChangedAt);
  const scope = normaliseLeadScope(opportunity.leadScope);
  const serviceText = [
    opportunity.title,
    opportunity.source,
    ...scope.productTypes,
    ...scope.customProductTypes,
    scope.notes,
  ]
    .filter(Boolean)
    .join(" ");

  if (minScore !== null && opportunity.score < minScore) {
    return { matched: false, reason: `score below ${minScore}` };
  }

  if (maxScore !== null && opportunity.score > maxScore) {
    return { matched: false, reason: `score above ${maxScore}` };
  }

  if (minStageAgeDays !== null && stageAgeDays < minStageAgeDays) {
    return {
      matched: false,
      reason: `stage age below ${minStageAgeDays} days`,
    };
  }

  if (maxStageAgeDays !== null && stageAgeDays > maxStageAgeDays) {
    return {
      matched: false,
      reason: `stage age above ${maxStageAgeDays} days`,
    };
  }

  if (!includesNeedle(opportunity.source ?? "", sourceIncludes)) {
    return {
      matched: false,
      reason: `source does not include ${sourceIncludes}`,
    };
  }

  if (!includesNeedle(serviceText, serviceIncludes)) {
    return {
      matched: false,
      reason: `service context does not include ${serviceIncludes}`,
    };
  }

  return { matched: true, reason: null };
}

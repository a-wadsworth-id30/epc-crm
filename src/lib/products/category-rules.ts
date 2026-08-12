export type ProductCategoryTagRuleOperator = "HAS_TAG" | "DOES_NOT_HAVE_TAG";
export type ProductCategoryTagRuleJoin = "AND" | "OR";

export type ProductCategoryTagRuleCondition = {
  tag: string;
  operator: ProductCategoryTagRuleOperator;
  join: ProductCategoryTagRuleJoin;
};

export function normalizeProductTag(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

export function normalizeProductTags(values: string[]) {
  return Array.from(
    new Set(values.map(normalizeProductTag).filter(Boolean)),
  );
}

export function legacyTagConditions(
  tags: string[],
  match: "ANY" | "ALL",
): ProductCategoryTagRuleCondition[] {
  return normalizeProductTags(tags).map((tag, index) => ({
    tag,
    operator: "HAS_TAG",
    join: index === 0 || match === "ALL" ? "AND" : "OR",
  }));
}

export function sanitizeTagRuleConditions(
  conditions: ProductCategoryTagRuleCondition[],
): ProductCategoryTagRuleCondition[] {
  return conditions
    .map((condition, index): ProductCategoryTagRuleCondition => ({
      tag: normalizeProductTag(condition.tag),
      operator:
        condition.operator === "DOES_NOT_HAVE_TAG"
          ? "DOES_NOT_HAVE_TAG"
          : "HAS_TAG",
      join:
        index === 0 || condition.join !== "OR"
          ? "AND"
          : "OR",
    }))
    .filter((condition) => condition.tag);
}

export function tagRuleConditionsFromUnknown(
  value: unknown,
  fallbackTags: string[] = [],
  fallbackMatch: "ANY" | "ALL" = "ANY",
): ProductCategoryTagRuleCondition[] {
  if (Array.isArray(value)) {
    const conditions = sanitizeTagRuleConditions(
      value
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item): ProductCategoryTagRuleCondition => ({
          tag: typeof item.tag === "string" ? item.tag : "",
          operator:
            item.operator === "DOES_NOT_HAVE_TAG"
              ? "DOES_NOT_HAVE_TAG"
              : "HAS_TAG",
          join: item.join === "OR" ? "OR" : "AND",
        })),
    );

    if (conditions.length) return conditions;
  }

  return legacyTagConditions(fallbackTags, fallbackMatch);
}

export function productMatchesTagRuleConditions(
  productTags: string[],
  conditions: ProductCategoryTagRuleCondition[],
) {
  const normalizedConditions = sanitizeTagRuleConditions(conditions);
  if (!normalizedConditions.length) return false;

  const tags = new Set(productTags.map(normalizeProductTag));

  return normalizedConditions.reduce<boolean | null>((current, condition) => {
    const conditionMatches =
      condition.operator === "DOES_NOT_HAVE_TAG"
        ? !tags.has(condition.tag)
        : tags.has(condition.tag);

    if (current === null) return conditionMatches;

    return condition.join === "OR"
      ? current || conditionMatches
      : current && conditionMatches;
  }, null) ?? false;
}

export function summarizeTagRuleConditions(
  conditions: ProductCategoryTagRuleCondition[],
) {
  const normalizedConditions = sanitizeTagRuleConditions(conditions);
  if (!normalizedConditions.length) return "No tag rules";

  return normalizedConditions
    .map((condition, index) => {
      const prefix = index === 0 ? "" : `${condition.join} `;
      const operator =
        condition.operator === "DOES_NOT_HAVE_TAG" ? "does not have" : "has";

      return `${prefix}tag ${operator} ${condition.tag}`;
    })
    .join(" ");
}

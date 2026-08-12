"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import { EditIcon, PlusIcon, SearchIcon } from "@/icons";
import { saveProductCategoryAction } from "@/lib/actions/products-discovery";
import {
  productMatchesTagRuleConditions,
  sanitizeTagRuleConditions,
  summarizeTagRuleConditions,
  type ProductCategoryTagRuleCondition,
  type ProductCategoryTagRuleJoin,
  type ProductCategoryTagRuleOperator,
} from "@/lib/products/category-rules";
import type {
  ProductCatalogRow,
  ProductCategoryOption,
} from "@/components/crm-boilerplate/ProductCatalogView";

export type ProductCategoryManagerProps = {
  categories: ProductCategoryOption[];
  products: ProductCatalogRow[];
};

const inputClassName =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const textareaClassName =
  "min-h-16 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const checkboxClassName =
  "h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700";

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function ProductCategoryManager({
  categories,
  products,
}: ProductCategoryManagerProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
            Categories
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Build manual categories or automated categories based on product tags.
          </p>
        </div>
        <CategoryDrawer
          products={products}
          trigger={<Button size="sm" startIcon={<PlusIcon />}>Add category</Button>}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
          <thead className="bg-gray-50 dark:bg-white/[0.02]">
            <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Rules</th>
              <th className="px-3 py-2">Products</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {categories.map((category) => (
              <tr key={category.id}>
                <td className="px-3 py-2">
                  <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                    {category.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {category.slug}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
                    {titleCase(category.collectionMode)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {category.collectionMode === "AUTOMATED" ? (
                    <span className="block max-w-[360px] text-xs text-gray-600 dark:text-gray-400">
                      {summarizeTagRuleConditions(category.ruleConditions)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Products selected manually
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300">
                  {category.productCount}
                  <span className="ml-1 text-xs text-gray-400">
                    ({category.activeProductCount} active)
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                      category.isActive
                        ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                        : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                    }`}
                  >
                    {category.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <CategoryDrawer
                      category={category}
                      products={products}
                      trigger={
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                          aria-label={`Edit ${category.name}`}
                        >
                          <EditIcon className="h-3.5 w-3.5" />
                        </button>
                      }
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!categories.length ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No product categories have been created yet.
        </p>
      ) : null}
    </section>
  );
}

function CategoryDrawer({
  category,
  products,
  trigger,
}: {
  category?: ProductCategoryOption;
  products: ProductCatalogRow[];
  trigger: ReactNode;
}) {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"MANUAL" | "AUTOMATED">(
    category?.collectionMode ?? "MANUAL",
  );
  const [query, setQuery] = useState("");
  const [ruleConditions, setRuleConditions] = useState<
    ProductCategoryTagRuleCondition[]
  >(
    category?.ruleConditions.length
      ? category.ruleConditions
      : [{ tag: "", operator: "HAS_TAG", join: "AND" }],
  );
  const [state, formAction, isPending] = useActionState(
    saveProductCategoryAction,
    { ok: false, message: "" },
  );

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Category saved.");
    queueMicrotask(() => setIsOpen(false));
  }, [showToast, state.message, state.ok]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return normalized
      ? products.filter((product) =>
          [product.name, product.sku, product.slug, ...product.tags]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalized)),
        )
      : products;
  }, [products, query]);

  const sanitizedRuleConditions = sanitizeTagRuleConditions(ruleConditions);
  const matchedProducts = products.filter((product) =>
    productMatchesTagRuleConditions(product.tags, sanitizedRuleConditions),
  );
  const updateRuleCondition = (
    index: number,
    field: keyof ProductCategoryTagRuleCondition,
    value: string,
  ) => {
    setRuleConditions((current) =>
      current.map((condition, conditionIndex) =>
        conditionIndex === index
          ? {
              ...condition,
              [field]: value,
            }
          : condition,
      ),
    );
  };
  const addRuleCondition = () => {
    setRuleConditions((current) => [
      ...current,
      { tag: "", operator: "HAS_TAG", join: "AND" },
    ]);
  };
  const removeRuleCondition = (index: number) => {
    setRuleConditions((current) =>
      current.length <= 1
        ? [{ tag: "", operator: "HAS_TAG", join: "AND" }]
        : current.filter((_, conditionIndex) => conditionIndex !== index),
    );
  };

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{trigger}</span>
      {isOpen ? (
        <div className="fixed inset-0 z-99999">
          <button
            type="button"
            aria-label="Close category editor"
            className="absolute inset-0 h-full w-full bg-gray-900/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
          <aside className="absolute top-0 right-0 flex h-full w-full max-w-[680px] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                  {category ? "Edit category" : "Add category"}
                </h2>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Manual categories use selected products. Automated categories
                  use product tags.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                x
              </button>
            </div>

            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
                {category ? (
                  <input type="hidden" name="id" value={category.id} />
                ) : null}

                <div className="grid gap-2.5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Category name
                    </span>
                    <input
                      name="name"
                      required
                      defaultValue={category?.name ?? ""}
                      className={inputClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Slug
                    </span>
                    <input
                      name="slug"
                      defaultValue={category?.slug ?? ""}
                      placeholder="auto-generated"
                      className={inputClassName}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Type
                    </span>
                    <select
                      name="collectionMode"
                      value={mode}
                      onChange={(event) =>
                        setMode(event.target.value as "MANUAL" | "AUTOMATED")
                      }
                      className={inputClassName}
                    >
                      <option value="MANUAL">Manual</option>
                      <option value="AUTOMATED">Automated</option>
                    </select>
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Description
                    </span>
                    <textarea
                      name="description"
                      defaultValue={category?.description ?? ""}
                      className={textareaClassName}
                    />
                  </label>
                </div>

                {mode === "AUTOMATED" ? (
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Automated tag conditions
                      </p>
                      <button
                        type="button"
                        onClick={addRuleCondition}
                        className="inline-flex h-7 items-center justify-center rounded-lg border border-gray-300 px-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                      >
                        Add condition
                      </button>
                    </div>
                    <div className="space-y-2">
                      {ruleConditions.map((condition, index) => (
                        <div
                          key={index}
                          className="grid gap-2 rounded-lg bg-gray-50 p-2 md:grid-cols-[88px_150px_minmax(0,1fr)_32px] dark:bg-white/[0.04]"
                        >
                          <select
                            name="ruleConditionJoins"
                            value={index === 0 ? "AND" : condition.join}
                            onChange={(event) =>
                              updateRuleCondition(
                                index,
                                "join",
                                event.target.value as ProductCategoryTagRuleJoin,
                              )
                            }
                            className={inputClassName}
                            aria-label={`Condition ${index + 1} join`}
                          >
                            <option value="AND">
                              {index === 0 ? "Where" : "AND"}
                            </option>
                            <option value="OR">OR</option>
                          </select>
                          <select
                            name="ruleConditionOperators"
                            value={condition.operator}
                            onChange={(event) =>
                              updateRuleCondition(
                                index,
                                "operator",
                                event.target
                                  .value as ProductCategoryTagRuleOperator,
                              )
                            }
                            className={inputClassName}
                            aria-label={`Condition ${index + 1} operator`}
                          >
                            <option value="HAS_TAG">has tag</option>
                            <option value="DOES_NOT_HAVE_TAG">
                              does not have tag
                            </option>
                          </select>
                          <input
                            name="ruleConditionTags"
                            value={condition.tag}
                            onChange={(event) =>
                              updateRuleCondition(
                                index,
                                "tag",
                                event.target.value,
                              )
                            }
                            placeholder="website"
                            className={inputClassName}
                            aria-label={`Condition ${index + 1} tag`}
                          />
                          <button
                            type="button"
                            onClick={() => removeRuleCondition(index)}
                            className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
                            aria-label={`Remove condition ${index + 1}`}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {matchedProducts.length} products currently match these
                      rules. Conditions are evaluated from top to bottom.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Manual products
                      </p>
                      <div className="relative w-full sm:max-w-[260px]">
                        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="search"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search products..."
                          className="h-8 w-full rounded-lg border border-gray-300 bg-transparent py-1 pr-3 pl-9 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90"
                        />
                      </div>
                    </div>
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {filteredProducts.map((product) => (
                        <label
                          key={product.id}
                          className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]"
                        >
                          <input
                            type="checkbox"
                            name="productIds"
                            value={product.id}
                            defaultChecked={category?.productIds.includes(product.id)}
                            className={`${checkboxClassName} mt-0.5`}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-800 dark:text-white/90">
                              {product.name}
                            </span>
                            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                              {product.tags.length
                                ? product.tags.join(", ")
                                : "No tags"}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={category?.isActive ?? true}
                    className={checkboxClassName}
                  />
                  Active
                </label>

                <ActionStateMessage state={state.ok ? undefined : state} />
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Saving..." : category ? "Save category" : "Add category"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

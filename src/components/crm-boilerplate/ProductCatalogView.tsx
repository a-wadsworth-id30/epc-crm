"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import {
  CrmDataTable,
  type CrmDataTableColumn,
} from "@/components/crm-boilerplate/data-table";
import LazyHelpTooltip from "@/components/crm-boilerplate/LazyHelpTooltip";
import ImageUploadDropzone from "@/components/crm-boilerplate/ImageUploadDropzone";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import Button from "@/components/ui/button/Button";
import type { ProductCategoryTagRuleCondition } from "@/lib/products/category-rules";
import {
  BoxIcon,
  EditIcon,
  PlusIcon,
} from "@/icons";
import { saveProductAction } from "@/lib/actions/products-discovery";

export type ProductCatalogRow = {
  id: string;
  name: string;
  slug: string;
  type: string;
  sku: string | null;
  description: string | null;
  tags: string[];
  isActive: boolean;
  imageUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIds: string[];
  categoryNames: string[];
  manualCategoryIds: string[];
  automatedCategoryIds: string[];
  templateIds: string[];
  templateNames: string[];
  questionCount: number;
};

export type ProductCategoryOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  collectionMode: "MANUAL" | "AUTOMATED";
  ruleMatch: "ANY" | "ALL";
  ruleTags: string[];
  ruleConditions: ProductCategoryTagRuleCondition[];
  isActive: boolean;
  productIds: string[];
  productCount: number;
  activeProductCount: number;
};

export type ProductTemplateOption = {
  id: string;
  name: string;
  scope: string;
};

const inputClassName =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const textareaClassName =
  "min-h-16 w-full rounded-lg border border-gray-300 bg-transparent px-2.5 py-1.5 text-sm text-gray-800 outline-none transition focus:border-brand-500 dark:border-gray-700 dark:text-white/90";

const checkboxClassName =
  "h-3.5 w-3.5 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700";

const productTypeOptions = [
  "SERVICE",
  "PHYSICAL",
  "DIGITAL",
  "SUBSCRIPTION",
  "BUNDLE",
];

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        active
          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function TypePill({ type }: { type: string }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">
      {titleCase(type)}
    </span>
  );
}

export default function ProductCatalogView({
  categories,
  products,
}: {
  categories: ProductCategoryOption[];
  products: ProductCatalogRow[];
}) {
  const activeCount = products.filter((product) => product.isActive).length;
  const linkedProductCount = products.filter(
    (product) => product.templateNames.length > 0,
  ).length;
  const categorisedCount = products.filter((product) => product.categoryIds.length).length;
  const questionCount = products.reduce(
    (total, product) => total + product.questionCount,
    0,
  );

  const columns: CrmDataTableColumn<ProductCatalogRow>[] = [
    {
      id: "name",
      header: "Product",
      sortable: true,
      sortValue: (product) => product.name,
      cell: (product) => (
        <div className="flex min-w-[220px] items-center gap-2">
          <span
            className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gray-100 bg-cover bg-center text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:ring-gray-800"
            style={
              product.imageUrl
                ? { backgroundImage: `url(${product.imageUrl})` }
                : undefined
            }
          >
            {product.imageUrl ? (
              <span className="sr-only">{product.name}</span>
            ) : (
              <BoxIcon className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-gray-800 dark:text-white/90">
              {product.name}
            </p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {product.sku || product.slug}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (product) => (product.isActive ? "active" : "inactive"),
      cell: (product) => <StatusPill active={product.isActive} />,
    },
    {
      id: "category",
      header: "Categories",
      sortable: true,
      sortValue: (product) => product.categoryNames.join(", "),
      cell: (product) =>
        product.categoryNames.length ? (
          <div className="flex max-w-[240px] flex-wrap gap-1">
            {product.categoryNames.slice(0, 3).map((category) => (
              <span
                key={category}
                className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
              >
                {category}
              </span>
            ))}
            {product.categoryNames.length > 3 ? (
              <span className="text-xs text-gray-400">
                +{product.categoryNames.length - 3}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-gray-400">Uncategorised</span>
        ),
    },
    {
      id: "type",
      header: "Type",
      sortable: true,
      sortValue: (product) => product.type,
      cell: (product) => <TypePill type={product.type} />,
    },
    {
      id: "tags",
      header: "Tags",
      cell: (product) =>
        product.tags.length ? (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {product.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              >
                {tag}
              </span>
            ))}
            {product.tags.length > 4 ? (
              <span className="text-xs text-gray-400">
                +{product.tags.length - 4}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-gray-400">No tags</span>
        ),
    },
    {
      id: "templates",
      header: "Linked discovery",
      sortable: true,
      sortValue: (product) => product.templateNames.length,
      cell: (product) =>
        product.templateNames.length ? (
          <div className="flex max-w-[320px] flex-wrap gap-1">
            {product.templateNames.map((template) => (
              <span
                key={template}
                className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
              >
                {template}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-400">No linked groups</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-theme-xs lg:flex-row lg:items-center lg:justify-between dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-brand-100 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/20">
              <BoxIcon className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
              Product catalogue
            </h2>
            <LazyHelpTooltip content="Products own catalogue data only. Discovery owns qualification questions and rules." />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              ["Products", products.length],
              ["Active", activeCount],
              ["Categorised", `${categorisedCount}/${products.length}`],
              ["Discovery linked", `${linkedProductCount}/${products.length}`],
              ["Questions", questionCount],
            ].map(([label, value]) => (
              <span
                key={label}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-gray-50 px-2 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:text-gray-300 dark:ring-gray-800"
              >
                <span className="text-gray-400 dark:text-gray-500">{label}</span>
                <span className="text-gray-900 dark:text-white">{value}</span>
              </span>
            ))}
          </div>
        </div>
        <ProductFormDrawer
          categories={categories}
          trigger={
            <Button size="sm" startIcon={<PlusIcon />}>
              Add product
            </Button>
          }
        />
      </div>

      <CrmDataTable
        data={products}
        columns={columns}
        getRowId={(product) => product.id}
        searchPlaceholder="Search products..."
        initialPageSize={25}
        initialSort={{ columnId: "name", direction: "asc" }}
        emptyState="No products match this search."
        getSearchValue={(product) =>
          [
            product.name,
            product.slug,
            product.type,
            product.sku,
            product.description,
            product.categoryName,
            ...product.tags,
            ...product.categoryNames,
            ...product.templateNames,
          ]
            .filter(Boolean)
            .join(" ")
        }
        renderRowActions={(product) => (
          <ProductFormDrawer
            categories={categories}
            product={product}
            trigger={
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5"
                aria-label={`Edit ${product.name}`}
              >
                <EditIcon className="h-4 w-4" />
              </button>
            }
          />
        )}
      />
    </div>
  );
}

function ProductFormDrawer({
  categories,
  product,
  trigger,
}: {
  categories: ProductCategoryOption[];
  product?: ProductCatalogRow;
  trigger: ReactNode;
}) {
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [state, formAction, isPending] = useActionState(saveProductAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (!state.ok) return;
    showToast(state.message || "Product saved.");
    queueMicrotask(() => {
      setIsDirty(false);
      setIsOpen(false);
    });
  }, [showToast, state.message, state.ok]);

  return (
    <>
      <span onClick={() => setIsOpen(true)}>{trigger}</span>
      {isOpen ? (
        <div className="fixed inset-0 z-99999">
          <button
            type="button"
            aria-label="Close product editor"
            className="absolute inset-0 h-full w-full bg-gray-900/30 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
          />
          <aside className="absolute top-0 right-0 flex h-full w-full max-w-[620px] flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-950">
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
                  {product ? "Edit product" : "Add product"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
              >
                x
              </button>
            </div>

            <form
              action={formAction}
              onChangeCapture={() => setIsDirty(true)}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
                {product ? <input type="hidden" name="id" value={product.id} /> : null}

                <ImageUploadDropzone
                  id={`product-image-${product?.id ?? "new"}`}
                  name="imageFile"
                  previewUrl={product?.imageUrl ?? null}
                  fallback={product?.name?.charAt(0).toUpperCase() ?? "P"}
                  title="Product image"
                  description="Upload a clear image or icon for this catalogue item."
                  disabled={isPending}
                  onFileAccepted={() => setIsDirty(true)}
                />

                {product?.imageUrl ? (
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      name="removeImage"
                      className={checkboxClassName}
                    />
                    Remove current image
                  </label>
                ) : null}

                {product ? (
                  <div className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      Assigned categories
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {product.categoryNames.length ? (
                        product.categoryNames.map((categoryName) => (
                          <span
                            key={categoryName}
                            className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
                          >
                            {categoryName}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          This product is not assigned to any categories yet.
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Manual category membership is managed from Products &gt;
                      Categories. Automated categories update from tags.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-2.5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Product name
                    </span>
                    <input name="name" required defaultValue={product?.name ?? ""} className={inputClassName} />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Slug
                    </span>
                    <input name="slug" defaultValue={product?.slug ?? ""} placeholder="auto-generated" className={inputClassName} />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      SKU
                    </span>
                    <input name="sku" defaultValue={product?.sku ?? ""} placeholder="Optional" className={inputClassName} />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Type
                    </span>
                    <select name="type" defaultValue={product?.type ?? "SERVICE"} className={inputClassName}>
                      {productTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {titleCase(type)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Category
                    </span>
                    <select name="categoryId" defaultValue={product?.categoryId ?? "none"} className={inputClassName}>
                      <option value="none">Uncategorised</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      New category
                    </span>
                    <input name="newCategoryName" placeholder="Create category instead of using selected category" className={inputClassName} />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Tags
                    </span>
                    <input
                      name="tagsText"
                      defaultValue={product?.tags.join(", ") ?? ""}
                      placeholder="e.g. website, ecommerce, retainer"
                      className={inputClassName}
                    />
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      Used by automated categories.
                    </span>
                  </label>

                  <label className="block md:col-span-2">
                    <span className="mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Description
                    </span>
                    <textarea name="description" defaultValue={product?.description ?? ""} className={textareaClassName} />
                  </label>
                </div>

                <div className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-800">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                        Linked discovery
                      </p>
                      <LazyHelpTooltip content="Discovery owns qualification groups and rules. Products only show which groups currently reference this item." />
                    </div>
                    <Link href="/discovery" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">
                      Manage
                    </Link>
                  </div>
                  {product?.templateNames.length ? (
                    <div className="flex flex-wrap gap-1">
                      {product.templateNames.map((template) => (
                        <span
                          key={template}
                          className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                        >
                          {template}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No discovery groups link to this product yet.
                    </p>
                  )}
                </div>

                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="isActive"
                    defaultChecked={product?.isActive ?? true}
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
                  disabled={isPending || !isDirty}
                  className="inline-flex h-8 items-center justify-center rounded-lg bg-brand-500 px-3 text-sm font-medium text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPending ? "Saving..." : product ? "Save product" : "Add product"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}

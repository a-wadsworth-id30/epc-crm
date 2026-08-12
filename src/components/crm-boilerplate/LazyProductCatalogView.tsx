"use client";

import dynamic from "next/dynamic";
import type {
  ProductCatalogRow,
  ProductCategoryOption,
} from "@/components/crm-boilerplate/ProductCatalogView";

type ProductCatalogViewProps = {
  categories: ProductCategoryOption[];
  products: ProductCatalogRow[];
};

function ProductCatalogLoading() {
  return (
    <div className="space-y-3">
      <section className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-theme-xs lg:flex-row lg:items-center lg:justify-between dark:border-gray-800 dark:bg-white/[0.03]">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
            <div className="h-5 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {["products", "active", "categorised", "linked", "questions"].map(
              (item) => (
                <div
                  key={item}
                  className="h-7 w-28 rounded-lg bg-gray-50 ring-1 ring-gray-200 dark:bg-white/[0.04] dark:ring-gray-800"
                />
              ),
            )}
          </div>
        </div>
        <div className="h-9 w-32 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
      </section>
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="h-10 w-full max-w-sm rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="divide-y divide-gray-100 lg:hidden dark:divide-gray-800">
          {["one", "two", "three", "four"].map((item) => (
            <div key={item} className="space-y-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-40 max-w-full rounded bg-gray-100 dark:bg-white/[0.08]" />
                  <div className="mt-2 h-3 w-28 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden max-w-full min-w-0 overflow-x-auto lg:block">
          <div className="min-w-[900px] divide-y divide-gray-100 dark:divide-gray-800">
            <div className="grid grid-cols-[1.5fr_0.7fr_1.2fr_0.8fr_1fr_1.2fr] gap-4 bg-gray-50 px-5 py-3 dark:bg-white/[0.02]">
              {["Product", "Status", "Categories", "Type", "Tags", "Discovery"].map(
                (item) => (
                  <div
                    key={item}
                    className="h-3 w-20 rounded bg-gray-100 dark:bg-white/[0.08]"
                  >
                    <span className="sr-only">{item}</span>
                  </div>
                ),
              )}
            </div>
            {["one", "two", "three", "four"].map((item) => (
              <div
                key={item}
                className="grid grid-cols-[1.5fr_0.7fr_1.2fr_0.8fr_1fr_1.2fr] gap-4 px-5 py-4"
              >
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
                  <div>
                    <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                    <div className="mt-2 h-3 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
                  </div>
                </div>
                <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-32 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-36 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
                <div className="h-6 w-40 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

const ProductCatalogView = dynamic<ProductCatalogViewProps>(
  () => import("@/components/crm-boilerplate/ProductCatalogView"),
  {
    loading: ProductCatalogLoading,
    ssr: false,
  },
);

export default function LazyProductCatalogView(props: ProductCatalogViewProps) {
  return <ProductCatalogView {...props} />;
}

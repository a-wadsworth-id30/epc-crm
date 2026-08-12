"use client";

import dynamic from "next/dynamic";
import type { ProductCategoryManagerProps } from "@/components/crm-boilerplate/ProductCategoryManager";

function ProductCategoryManagerLoading() {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
        <div>
          <div className="h-5 w-28 rounded bg-gray-100 dark:bg-white/[0.08]" />
          <div className="mt-2 h-3 w-72 max-w-full rounded bg-gray-50 dark:bg-white/[0.05]" />
        </div>
        <div className="h-9 w-32 rounded-lg bg-gray-100 dark:bg-white/[0.08]" />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[900px] divide-y divide-gray-100 dark:divide-gray-800">
          <div className="grid grid-cols-[1.2fr_0.7fr_1.4fr_0.7fr_0.7fr_0.5fr] gap-4 bg-gray-50 px-3 py-2 dark:bg-white/[0.02]">
            {["Category", "Type", "Rules", "Products", "Status", "Actions"].map(
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
              className="grid grid-cols-[1.2fr_0.7fr_1.4fr_0.7fr_0.7fr_0.5fr] gap-4 px-3 py-3"
            >
              <div>
                <div className="h-4 w-40 rounded bg-gray-100 dark:bg-white/[0.08]" />
                <div className="mt-2 h-3 w-28 rounded bg-gray-50 dark:bg-white/[0.05]" />
              </div>
              <div className="h-6 w-20 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-64 rounded bg-gray-50 dark:bg-white/[0.05]" />
              <div className="h-4 w-16 rounded bg-gray-100 dark:bg-white/[0.08]" />
              <div className="h-6 w-16 rounded-full bg-gray-50 dark:bg-white/[0.05]" />
              <div className="ml-auto h-7 w-7 rounded-lg bg-gray-50 dark:bg-white/[0.05]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const ProductCategoryManager = dynamic<ProductCategoryManagerProps>(
  () => import("@/components/crm-boilerplate/ProductCategoryManager"),
  {
    loading: ProductCategoryManagerLoading,
    ssr: false,
  },
);

export default function LazyProductCategoryManager(
  props: ProductCategoryManagerProps,
) {
  return <ProductCategoryManager {...props} />;
}

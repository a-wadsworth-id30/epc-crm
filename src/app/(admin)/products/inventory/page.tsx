import type { Metadata } from "next";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getProductCatalogObjectData } from "@/lib/object-data/products-discovery";

export const metadata: Metadata = {
  title: "Product Inventory | iD30 CRM",
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ProductInventoryPage() {
  await requireAdmin();

  const { products } = await getProductCatalogObjectData();

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Review product catalogue availability and identifiers."
      />

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-3 py-2.5 dark:border-gray-800">
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">
            Catalogue inventory
          </h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Stock quantities are not tracked yet; this view shows catalogue
            readiness.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
            <thead className="bg-gray-50 dark:bg-white/[0.02]">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase dark:text-gray-400">
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Categories</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-3 py-2">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white/90">
                      {product.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {product.slug}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300">
                    {product.sku || "No SKU"}
                  </td>
                  <td className="px-3 py-2">
                    {product.categoryNames.length ? (
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {product.categoryNames.map((categoryName) => (
                          <span
                            key={categoryName}
                            className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-white/[0.06] dark:text-gray-300"
                          >
                            {categoryName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-gray-500 dark:text-gray-400">
                        Uncategorised
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {product.tags.length ? (
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {product.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[13px] text-gray-500 dark:text-gray-400">
                        No tags
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[13px] text-gray-700 dark:text-gray-300">
                    {titleCase(product.type)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        product.isActive
                          ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                          : "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400"
                      }`}
                    >
                      {product.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!products.length ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
            No products have been created yet.
          </p>
        ) : null}
      </section>
    </>
  );
}

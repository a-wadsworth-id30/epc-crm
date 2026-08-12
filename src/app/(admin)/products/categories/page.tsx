import type { Metadata } from "next";
import LazyProductCategoryManager from "@/components/crm-boilerplate/LazyProductCategoryManager";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getProductCatalogObjectData } from "@/lib/object-data/products-discovery";

export const metadata: Metadata = {
  title: "Product Categories | iD30 CRM",
};

export default async function ProductCategoriesPage() {
  await requireAdmin();

  const { categories, products } = await getProductCatalogObjectData();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Create manual or automated product categories."
      />
      <LazyProductCategoryManager categories={categories} products={products} />
    </>
  );
}

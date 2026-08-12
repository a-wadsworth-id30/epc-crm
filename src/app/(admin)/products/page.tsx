import type { Metadata } from "next";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import ProductCatalogView from "@/components/crm-boilerplate/LazyProductCatalogView";
import { requireAdmin } from "@/lib/auth";
import { getProductCatalogObjectData } from "@/lib/object-data/products-discovery";

export const metadata: Metadata = {
  title: "Products | iD30 CRM",
};

export default async function ProductsPage() {
  await requireAdmin();

  const { categories, products } = await getProductCatalogObjectData();

  return (
    <>
      <PageHeader
        title="Products"
        description="Reusable products and services for lead scoping."
      />
      <ProductCatalogView
        categories={categories}
        products={products}
      />
    </>
  );
}

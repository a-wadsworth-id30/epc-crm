import type { Metadata } from "next";
import DiscoveryQuestionSetupView from "@/components/crm-boilerplate/LazyDiscoveryQuestionSetupView";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { getDiscoveryQuestionObjectData } from "@/lib/object-data/products-discovery";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Discovery | iD30 CRM",
};

export default async function DiscoveryPage() {
  await requireAdmin();

  const [{ categories, products, questions, templates }, stages] =
    await Promise.all([
      getDiscoveryQuestionObjectData(),
      prisma.salesPipelineStage.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);

  return (
    <>
      <PageHeader
        title="Discovery"
        description="Qualification groups, reusable questions, stage requirements and product-linked discovery logic."
      />
      <DiscoveryQuestionSetupView
        categories={categories}
        products={products}
        questions={questions}
        stages={stages}
        templates={templates}
      />
    </>
  );
}

import PageHeader from "@/components/crm-boilerplate/PageHeader";
import SalesPipelineStageManager, {
  type SalesPipelineStageManagerItem,
} from "@/components/crm-boilerplate/LazySalesPipelineStageManager";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseSalesKanbanSettings } from "@/lib/sales/kanban-settings";
import {
  parseStageRequiredActions,
  parseStageRequiredDocumentTypes,
} from "@/lib/sales/stage-requirements";
import { getCrmSettings } from "@/lib/settings";

export default async function SalesPipelineSettingsPage() {
  await requireAdmin();

  const [stages, settings] = await Promise.all([
    prisma.salesPipelineStage.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        bucket: true,
        sortOrder: true,
        defaultProbability: true,
        goal: true,
        aiContext: true,
        slaDays: true,
        movementPolicy: true,
        gateMode: true,
        isActive: true,
        isClosed: true,
        isWon: true,
        isLost: true,
        color: true,
        description: true,
        metadata: true,
        _count: {
          select: {
            opportunities: true,
            lifecycleEventsFrom: true,
            lifecycleEventsTo: true,
          },
        },
      },
    }),
    getCrmSettings(),
  ]);

  const stageItems: SalesPipelineStageManagerItem[] = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    slug: stage.slug,
    bucket: stage.bucket,
    sortOrder: stage.sortOrder,
    defaultProbability: stage.defaultProbability,
    goal: stage.goal,
    aiContext: stage.aiContext,
    slaDays: stage.slaDays,
    movementPolicy: stage.movementPolicy,
    gateMode: stage.gateMode,
    isActive: stage.isActive,
    isClosed: stage.isClosed,
    isWon: stage.isWon,
    isLost: stage.isLost,
    color: stage.color,
    description: stage.description,
    requiredActions: parseStageRequiredActions(stage.metadata),
    requiredDocumentTypes: parseStageRequiredDocumentTypes(stage.metadata),
    opportunityCount: stage._count.opportunities,
    lifecycleEventCount:
      stage._count.lifecycleEventsFrom + stage._count.lifecycleEventsTo,
  }));

  const nextSortOrder =
    stageItems.reduce(
      (highest, stage) => Math.max(highest, stage.sortOrder),
      0,
    ) + 10;

  return (
    <>
      <PageHeader
        title="Sales Pipeline"
        description="Configure custom sales stages while keeping stable reporting buckets for attribution and conversion workflows."
      />
      <SalesPipelineStageManager
        kanbanSettings={parseSalesKanbanSettings(settings.salesKanban)}
        stages={stageItems}
        nextSortOrder={nextSortOrder}
      />
    </>
  );
}

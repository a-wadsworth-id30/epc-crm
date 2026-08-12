import LazyGeneralSettingsForm from "@/components/crm-boilerplate/LazyGeneralSettingsForm";
import PageHeader from "@/components/crm-boilerplate/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { parseDocumentLibrarySettings } from "@/lib/document-library";
import { parseDisplayDefaults } from "@/lib/display-defaults";
import { parseInterfaceDefaults } from "@/lib/interface-defaults";
import { parseModuleToggles } from "@/lib/module-toggles";
import { parseNotificationDefaults } from "@/lib/notification-defaults";
import { prisma } from "@/lib/prisma";
import { parseSalesDefaults } from "@/lib/sales/defaults";
import { getCrmSettings } from "@/lib/settings";
import { parseTaskDefaults } from "@/lib/tasks/defaults";
import { parseWorkspaceDefaults } from "@/lib/workspace-defaults";

export default async function GeneralSettingsPage() {
  await requireAdmin();
  const [settings, activeUsers, activePipelineStages] = await Promise.all([
    getCrmSettings(),
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: { email: true, id: true, name: true },
    }),
    prisma.salesPipelineStage.findMany({
      where: { isActive: true, isClosed: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { bucket: true, id: true, name: true },
    }),
  ]);
  const moduleToggles = parseModuleToggles(
    settings.moduleToggles,
    settings.companiesEnabled,
  );
  const notificationDefaults = parseNotificationDefaults(
    settings.notificationDefaults,
  );
  const displayDefaults = parseDisplayDefaults(settings.displayDefaults);
  const documentLibrary = parseDocumentLibrarySettings(settings.documentLibrary);
  const interfaceDefaults = parseInterfaceDefaults(settings.interfaceDefaults);
  const workspaceDefaults = parseWorkspaceDefaults(settings.workspaceDefaults);
  const salesDefaults = parseSalesDefaults(settings.salesDefaults);
  const taskDefaults = parseTaskDefaults(settings.taskDefaults);
  const activeUserOptions = activeUsers.map((activeUser) => ({
    label: activeUser.name || activeUser.email,
    value: activeUser.id,
  }));
  const salesStageOptions = activePipelineStages.map((stage) => ({
    label: `${stage.name} (${stage.bucket.toLowerCase()})`,
    value: stage.id,
  }));

  return (
    <>
      <PageHeader title="General Settings" description="Application-wide defaults for this CRM workspace." />
      <LazyGeneralSettingsForm
        companiesEnabled={settings.companiesEnabled}
        displayDefaults={displayDefaults}
        documentLibrary={documentLibrary}
        interfaceDefaults={interfaceDefaults}
        moduleToggles={moduleToggles}
        notificationDefaults={notificationDefaults}
        salesDefaults={salesDefaults}
        salesOwnerOptions={activeUserOptions}
        salesStageOptions={salesStageOptions}
        taskAssigneeOptions={activeUserOptions}
        taskDefaults={taskDefaults}
        workspaceDefaults={workspaceDefaults}
        canEdit
      />
    </>
  );
}

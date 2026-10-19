import PageHeader from "@/components/crm-boilerplate/PageHeader";
import RoleDashboardEditor from "@/components/crm-boilerplate/RoleDashboardEditor";
import { requireAdmin } from "@/lib/auth";
import { loadRoleDashboardLayout } from "@/lib/dashboard/preferences";
import { userRoleTemplates } from "@/lib/users/role-templates";

export default async function DashboardSettingsPage() {
  await requireAdmin();
  const entries = await Promise.all(
    userRoleTemplates.map(
      async (role) =>
        [role.key, await loadRoleDashboardLayout(role.key)] as const,
    ),
  );

  return (
    <>
      <PageHeader
        title="Dashboard layouts"
        description="Set the default dashboard widgets, order and sizes for each CRM role. Individual users can personalise the permitted widgets from their dashboard."
      />
      <RoleDashboardEditor
        initialLayouts={
          Object.fromEntries(entries) as Record<
            (typeof userRoleTemplates)[number]["key"],
            Awaited<ReturnType<typeof loadRoleDashboardLayout>>
          >
        }
        roles={userRoleTemplates.map((role) => ({
          description: role.description,
          key: role.key,
          label: role.label,
        }))}
      />
    </>
  );
}

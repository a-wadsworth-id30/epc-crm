import PageHeader from "@/components/crm-boilerplate/PageHeader";
import {
  DeferredUserBulkImportPanel,
  DeferredUserCreateModal,
} from "@/components/crm-boilerplate/UserSettingsLoaders";
import UsersTable from "@/components/crm-boilerplate/LazyUsersTable";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeRoleTemplate } from "@/lib/users/role-templates";

function setupLinkStatus(
  token:
    | {
        expiresAt: Date;
        usedAt: Date | null;
      }
    | undefined,
) {
  if (!token) return "NONE";
  if (token.usedAt) return "ACCEPTED";
  if (token.expiresAt <= new Date()) return "EXPIRED";
  return "PENDING";
}

export default async function UsersSettingsPage() {
  const admin = await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true,
      email: true,
      id: true,
      name: true,
      role: true,
      roleTemplate: true,
      status: true,
      voiceAvailability: true,
      passwordResetTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          expiresAt: true,
          usedAt: true,
        },
        take: 1,
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Users & Permissions"
        description="Admins can add users, change roles and remove accounts."
        actions={<DeferredUserCreateModal />}
      />
      <div className="space-y-6">
        <DeferredUserBulkImportPanel />
        <UsersTable
          users={users.map((user) => ({
            createdAt: user.createdAt.toISOString(),
            disabledActions: user.id === admin.id,
            email: user.email,
            id: user.id,
            name: user.name,
            role: user.role,
            roleTemplate: normalizeRoleTemplate(user.roleTemplate),
            setupLinkExpiresAt:
              user.passwordResetTokens[0]?.expiresAt.toISOString() ?? null,
            setupLinkStatus: setupLinkStatus(user.passwordResetTokens[0]),
            setupLinkUsedAt:
              user.passwordResetTokens[0]?.usedAt?.toISOString() ?? null,
            status: user.status,
            voiceAvailability: user.voiceAvailability,
          }))}
        />
      </div>
    </>
  );
}

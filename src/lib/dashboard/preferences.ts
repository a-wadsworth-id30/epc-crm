import "server-only";

import type { UserRole } from "@prisma/client";
import {
  defaultDashboardLayout,
  normalizeDashboardLayout,
  type DashboardLayoutItem,
} from "@/lib/dashboard/layout";
import { prisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prisma-errors";
import {
  defaultRoleTemplateForRole,
  normalizeRoleTemplate,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

export function resolvedDashboardRoleTemplate(user: {
  role: UserRole;
  roleTemplate?: string | null;
}): UserRoleTemplateKey {
  return (
    normalizeRoleTemplate(user.roleTemplate) ??
    defaultRoleTemplateForRole(user.role)
  );
}

export type ResolvedDashboardLayout = {
  hasPersonalLayout: boolean;
  layout: DashboardLayoutItem[];
  roleLayout: DashboardLayoutItem[];
  roleTemplate: UserRoleTemplateKey;
};

export async function loadDashboardLayout(user: {
  id: string;
  role: UserRole;
  roleTemplate?: string | null;
}): Promise<ResolvedDashboardLayout> {
  const roleTemplate = resolvedDashboardRoleTemplate(user);
  const systemDefault = defaultDashboardLayout(roleTemplate);

  try {
    const [savedRoleLayout, savedUserLayout] = await Promise.all([
      prisma.dashboardRoleLayout.findUnique({
        where: { roleTemplate },
        select: { layout: true },
      }),
      prisma.dashboardUserLayout.findUnique({
        where: { userId: user.id },
        select: { layout: true, roleTemplate: true },
      }),
    ]);
    const roleLayout = normalizeDashboardLayout(
      savedRoleLayout?.layout,
      roleTemplate,
      systemDefault,
    );
    const personalLayoutApplies =
      savedUserLayout?.roleTemplate === roleTemplate;

    return {
      hasPersonalLayout: personalLayoutApplies,
      layout: personalLayoutApplies
        ? normalizeDashboardLayout(
            savedUserLayout.layout,
            roleTemplate,
            roleLayout,
          )
        : roleLayout,
      roleLayout,
      roleTemplate,
    };
  } catch (error) {
    if (
      !isPrismaMissingTableError(error, { tableName: "DashboardRoleLayout" }) &&
      !isPrismaMissingTableError(error, { tableName: "DashboardUserLayout" })
    ) {
      throw error;
    }

    return {
      hasPersonalLayout: false,
      layout: systemDefault,
      roleLayout: systemDefault,
      roleTemplate,
    };
  }
}

export async function loadRoleDashboardLayout(
  roleTemplate: UserRoleTemplateKey,
) {
  const systemDefault = defaultDashboardLayout(roleTemplate);
  try {
    const saved = await prisma.dashboardRoleLayout.findUnique({
      where: { roleTemplate },
      select: { layout: true },
    });
    return normalizeDashboardLayout(saved?.layout, roleTemplate, systemDefault);
  } catch (error) {
    if (
      !isPrismaMissingTableError(error, { tableName: "DashboardRoleLayout" })
    ) {
      throw error;
    }
    return systemDefault;
  }
}

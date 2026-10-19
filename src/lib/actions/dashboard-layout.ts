"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import {
  defaultDashboardLayout,
  normalizeDashboardLayout,
} from "@/lib/dashboard/layout";
import {
  loadRoleDashboardLayout,
  resolvedDashboardRoleTemplate,
} from "@/lib/dashboard/preferences";
import { prisma } from "@/lib/prisma";
import { normalizeRoleTemplate } from "@/lib/users/role-templates";

type DashboardLayoutActionResult = {
  message: string;
  ok: boolean;
};

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeLayoutInput(value: unknown) {
  const serialized = JSON.stringify(value);
  if (!serialized || serialized.length > 30_000) {
    throw new Error("Dashboard layout is invalid or too large.");
  }
  return value;
}

export async function saveMyDashboardLayoutAction(
  value: unknown,
): Promise<DashboardLayoutActionResult> {
  const user = await requireUser();
  const roleTemplate = resolvedDashboardRoleTemplate(user);
  const roleLayout = await loadRoleDashboardLayout(roleTemplate);
  const layout = normalizeDashboardLayout(
    safeLayoutInput(value),
    roleTemplate,
    roleLayout,
  );

  await prisma.dashboardUserLayout.upsert({
    where: { userId: user.id },
    create: {
      layout: jsonValue(layout),
      roleTemplate,
      userId: user.id,
    },
    update: {
      layout: jsonValue(layout),
      roleTemplate,
    },
  });
  revalidatePath("/");
  return { ok: true, message: "Your dashboard layout was saved." };
}

export async function resetMyDashboardLayoutAction(): Promise<DashboardLayoutActionResult> {
  const user = await requireUser();
  await prisma.dashboardUserLayout.deleteMany({ where: { userId: user.id } });
  revalidatePath("/");
  return { ok: true, message: "Your dashboard was reset to the role default." };
}

export async function saveRoleDashboardLayoutAction(
  roleTemplateInput: string,
  value: unknown,
): Promise<DashboardLayoutActionResult> {
  const admin = await requireAdmin();
  const roleTemplate = normalizeRoleTemplate(roleTemplateInput);
  if (!roleTemplate)
    return { ok: false, message: "Choose a valid role template." };
  const layout = normalizeDashboardLayout(
    safeLayoutInput(value),
    roleTemplate,
    defaultDashboardLayout(roleTemplate),
  );

  await prisma.$transaction([
    prisma.dashboardRoleLayout.upsert({
      where: { roleTemplate },
      create: {
        layout: jsonValue(layout),
        roleTemplate,
        updatedByUserId: admin.id,
      },
      update: {
        layout: jsonValue(layout),
        updatedByUserId: admin.id,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: "dashboard.role_layout.updated",
        actorId: admin.id,
        entity: "DashboardRoleLayout",
        entityId: roleTemplate,
        metadata: jsonValue({ roleTemplate, widgetCount: layout.length }),
      },
    }),
  ]);
  revalidatePath("/");
  revalidatePath("/settings/dashboard");
  return { ok: true, message: "Role dashboard default was saved." };
}

export async function resetRoleDashboardLayoutAction(
  roleTemplateInput: string,
): Promise<DashboardLayoutActionResult> {
  const admin = await requireAdmin();
  const roleTemplate = normalizeRoleTemplate(roleTemplateInput);
  if (!roleTemplate)
    return { ok: false, message: "Choose a valid role template." };
  await prisma.$transaction([
    prisma.dashboardRoleLayout.deleteMany({ where: { roleTemplate } }),
    prisma.auditLog.create({
      data: {
        action: "dashboard.role_layout.reset",
        actorId: admin.id,
        entity: "DashboardRoleLayout",
        entityId: roleTemplate,
        metadata: jsonValue({ roleTemplate }),
      },
    }),
  ]);
  revalidatePath("/");
  revalidatePath("/settings/dashboard");
  return {
    ok: true,
    message: "Role dashboard was reset to the system default.",
  };
}

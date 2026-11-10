import type { UserRole } from "@prisma/client";
import {
  defaultRoleTemplateForRole,
  normalizeRoleTemplate,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

export type ContactFieldAccessUser = {
  role: UserRole;
  roleTemplate?: string | null;
};

export type ContactFieldAccessDefinition = {
  viewRoleTemplates?: string[];
  editRoleTemplates?: string[];
};

export function resolvedContactFieldRoleTemplate(
  user: ContactFieldAccessUser,
): UserRoleTemplateKey {
  return (
    normalizeRoleTemplate(user.roleTemplate) ??
    defaultRoleTemplateForRole(user.role)
  );
}

function allows(
  configuredRoles: string[] | undefined,
  user: ContactFieldAccessUser,
) {
  if (user.role === "ADMIN") return true;
  if (!configuredRoles?.length) return true;
  return configuredRoles.includes(resolvedContactFieldRoleTemplate(user));
}

export function canViewContactField(
  field: ContactFieldAccessDefinition,
  user: ContactFieldAccessUser,
) {
  return allows(field.viewRoleTemplates, user);
}

export function canEditContactField(
  field: ContactFieldAccessDefinition,
  user: ContactFieldAccessUser,
) {
  return (
    canViewContactField(field, user) &&
    allows(field.editRoleTemplates, user)
  );
}

export function visibleContactFields<T extends ContactFieldAccessDefinition>(
  fields: T[],
  user: ContactFieldAccessUser,
) {
  return fields.filter((field) => canViewContactField(field, user));
}

export function editableContactFields<T extends ContactFieldAccessDefinition>(
  fields: T[],
  user: ContactFieldAccessUser,
) {
  return fields.filter((field) => canEditContactField(field, user));
}

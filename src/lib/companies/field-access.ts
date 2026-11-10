import type { ContactFieldAccessUser } from "@/lib/contacts/field-access";
import {
  canEditContactField,
  canViewContactField,
  type ContactFieldAccessDefinition,
} from "@/lib/contacts/field-access";

export type CompanyFieldAccessDefinition = ContactFieldAccessDefinition;
export type CompanyFieldAccessUser = ContactFieldAccessUser;

export function canViewCompanyField(
  field: CompanyFieldAccessDefinition,
  user: CompanyFieldAccessUser,
) {
  return canViewContactField(field, user);
}

export function canEditCompanyField(
  field: CompanyFieldAccessDefinition,
  user: CompanyFieldAccessUser,
) {
  return canEditContactField(field, user);
}

export function visibleCompanyFields<T extends CompanyFieldAccessDefinition>(
  fields: T[],
  user: CompanyFieldAccessUser,
) {
  return fields.filter((field) => canViewCompanyField(field, user));
}

export function editableCompanyFields<T extends CompanyFieldAccessDefinition>(
  fields: T[],
  user: CompanyFieldAccessUser,
) {
  return fields.filter((field) => canEditCompanyField(field, user));
}

import { z } from "zod";
import {
  normalizeRoleTemplate,
  userRoleTemplateSchema,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

const roleTemplateFormSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return normalizeRoleTemplate(value) ?? value;
}, userRoleTemplateSchema);

const createUserFormSchema = z
  .object({
    email: z.string().trim().email(),
    name: z.string().trim().min(2),
    password: z.string().min(1),
    role: z.enum(["ADMIN", "USER"]).optional(),
    roleTemplate: roleTemplateFormSchema.optional(),
  })
  .refine((data) => data.roleTemplate || data.role, {
    path: ["roleTemplate"],
  });

export type CreateUserFormInput = {
  email: string;
  name: string;
  password: string;
  role?: "ADMIN" | "USER";
  roleTemplate?: UserRoleTemplateKey;
};

export function parseCreateUserFormData(formData: Pick<FormData, "get">) {
  return createUserFormSchema.safeParse({
    email: formString(formData.get("email")),
    name: formString(formData.get("name")),
    password: formString(formData.get("password")),
    role: optionalFormString(formData.get("role")),
    roleTemplate: optionalFormString(formData.get("roleTemplate")),
  });
}

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

function optionalFormString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

"use client";

import { useState } from "react";
import {
  deleteUserAction,
  sendUserSetupLinkAction,
  updateUserRoleTemplateAction,
  updateUserRoleAction,
} from "@/lib/actions/auth";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import {
  defaultRoleTemplateForRole,
  userRoleTemplates,
  type UserRoleTemplateKey,
} from "@/lib/users/role-templates";

export function UserRoleForm({
  userId,
  initialRole,
  disabled,
}: {
  userId: string;
  initialRole: "ADMIN" | "USER";
  disabled: boolean;
}) {
  const [role, setRole] = useState(initialRole);
  const [savedRole, setSavedRole] = useState(initialRole);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const isDirty = role !== savedRole;

  return (
    <form
      action={async (formData) => {
        setIsSubmitting(true);
        try {
          await updateUserRoleAction(formData);
          setSavedRole(role);
          showToast("User role saved.");
        } catch {
          showToast("Could not save that user role.", "error");
        } finally {
          setIsSubmitting(false);
        }
      }}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        value={role}
        disabled={disabled}
        onChange={(event) => setRole(event.target.value as "ADMIN" | "USER")}
        className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
      >
        <option value="USER">User</option>
        <option value="ADMIN">Admin</option>
      </select>
      <button
        type="submit"
        disabled={disabled || isSubmitting || !isDirty}
        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-white/5"
      >
        {isSubmitting ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export function UserRoleTemplateForm({
  disabled,
  initialBaseRole,
  initialRoleTemplate,
  userId,
}: {
  disabled: boolean;
  initialBaseRole: "ADMIN" | "USER";
  initialRoleTemplate: UserRoleTemplateKey | null;
  userId: string;
}) {
  const fallbackTemplate = defaultRoleTemplateForRole(initialBaseRole);
  const initialTemplate = initialRoleTemplate ?? fallbackTemplate;
  const [roleTemplate, setRoleTemplate] = useState(initialTemplate);
  const [savedRoleTemplate, setSavedRoleTemplate] = useState(initialTemplate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();
  const isDirty = roleTemplate !== savedRoleTemplate;

  return (
    <form
      action={async (formData) => {
        setIsSubmitting(true);
        try {
          await updateUserRoleTemplateAction(formData);
          setSavedRoleTemplate(roleTemplate);
          showToast("Role template saved.");
        } catch {
          showToast("Could not save that role template.", "error");
        } finally {
          setIsSubmitting(false);
        }
      }}
      className="flex min-w-64 flex-col gap-2 sm:flex-row sm:items-center"
    >
      <input type="hidden" name="userId" value={userId} />
      <select
        name="roleTemplate"
        value={roleTemplate}
        disabled={disabled}
        onChange={(event) =>
          setRoleTemplate(event.target.value as UserRoleTemplateKey)
        }
        className="h-10 rounded-lg border border-gray-300 bg-transparent px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
      >
        {userRoleTemplates.map((template) => (
          <option key={template.key} value={template.key}>
            {template.label} ({template.baseRole})
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={disabled || isSubmitting || !isDirty}
        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-white/5"
      >
        {isSubmitting ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

export function UserDeleteForm({
  userId,
  disabled,
}: {
  userId: string;
  disabled: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  return (
    <form
      action={async (formData) => {
        if (!window.confirm("Delete this user account? This cannot be undone.")) {
          return;
        }

        setIsSubmitting(true);
        try {
          await deleteUserAction(formData);
          showToast("User deleted.");
        } catch {
          showToast("Could not delete that user.", "error");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={disabled || isSubmitting}
        className="rounded-lg border border-error-300 px-3 py-2 text-xs font-medium text-error-600 hover:bg-error-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isSubmitting ? "Deleting..." : "Delete"}
      </button>
    </form>
  );
}

export function UserSetupLinkForm({
  disabled,
  userId,
  variant,
}: {
  disabled: boolean;
  userId: string;
  variant: "send" | "resend";
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showToast } = useToast();

  return (
    <form
      action={async (formData) => {
        setIsSubmitting(true);
        try {
          const result = await sendUserSetupLinkAction(
            { ok: false, message: "" },
            formData,
          );
          showToast(result.message, result.ok ? "success" : "error");
        } catch {
          showToast("Could not send the setup link.", "error");
        } finally {
          setIsSubmitting(false);
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={disabled || isSubmitting}
        className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/5"
      >
        {isSubmitting
          ? "Sending..."
          : variant === "resend"
            ? "Resend link"
            : "Send link"}
      </button>
    </form>
  );
}

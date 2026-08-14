"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import { useToast } from "@/components/crm-boilerplate/ToastProvider";
import { createUserAction } from "@/lib/actions/auth";
import { userRoleTemplates } from "@/lib/users/role-templates";

const uppercaseChars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const lowercaseChars = "abcdefghijkmnopqrstuvwxyz";
const numberChars = "23456789";
const symbolChars = "!@#$%^&*?";
const passwordChars =
  uppercaseChars + lowercaseChars + numberChars + symbolChars;
const temporaryPasswordLength = 16;
const passwordPolicyHint =
  "Use 10+ characters with uppercase, lowercase, number and symbol.";

function randomIndex(max: number) {
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] % max;
}

function randomChar(chars: string) {
  return chars[randomIndex(chars.length)];
}

function shuffleChars(chars: string[]) {
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars;
}

function generateTemporaryPassword() {
  const chars = [
    randomChar(uppercaseChars),
    randomChar(lowercaseChars),
    randomChar(numberChars),
    randomChar(symbolChars),
  ];

  while (chars.length < temporaryPasswordLength) {
    chars.push(randomChar(passwordChars));
  }

  return shuffleChars(chars).join("");
}

export default function UserCreateForm({ onSuccess }: { onSuccess?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [password, setPassword] = useState("");
  const { showToast } = useToast();
  const [state, formAction, isPending] = useActionState(createUserAction, {
    ok: false,
    message: "",
  });

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    formRef.current?.reset();
    queueMicrotask(() => {
      setPassword("");
      setIsDirty(false);
      onSuccess?.();
    });
    showToast(state.message || "User created.");
  }, [onSuccess, showToast, state.message, state.ok]);

  function handleGeneratePassword() {
    setPassword(generateTemporaryPassword());
    setIsDirty(true);
  }

  return (
    <form ref={formRef} action={formAction} onChangeCapture={() => setIsDirty(true)}>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="new-user-name">Name</Label>
          <Input id="new-user-name" name="name" required />
        </div>
        <div>
          <Label htmlFor="new-user-email">Email</Label>
          <Input id="new-user-email" name="email" type="email" required />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="new-user-role-template">Role template</Label>
          <select
            id="new-user-role-template"
            name="roleTemplate"
            defaultValue="sales-user"
            className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            {userRoleTemplates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label} - {template.accessSummary}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Owner and Admin templates create ADMIN access. Other templates use
            standard USER access until finer permissions are enabled.
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <Label htmlFor="new-user-password" className="mb-0">
              Temporary password
            </Label>
            <button
              type="button"
              onClick={handleGeneratePassword}
              disabled={isPending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-gray-300 px-2.5 text-xs font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.03]"
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Generate
            </button>
          </div>
          <Input
            id="new-user-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            placeholder="ChangeMe123!"
            hint={passwordPolicyHint}
            required
          />
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <ActionStateMessage state={state} />
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create user"}
        </button>
      </div>
    </form>
  );
}

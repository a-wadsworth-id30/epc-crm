"use client";

import { useActionState } from "react";
import Link from "next/link";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { resetPasswordWithTokenAction } from "@/lib/actions/auth";

export default function ResetPasswordConfirmForm({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const [state, formAction, isPending] = useActionState(
    resetPasswordWithTokenAction,
    {
      ok: false,
      message: "",
    },
  );

  return (
    <div className="flex w-full flex-1 flex-col lg:w-1/2">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-5 sm:mb-8">
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
            Choose a new password
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Set a new password for {email}. This will sign out any active
            sessions for the account.
          </p>
        </div>

        <ActionStateMessage state={state} />

        {state.ok ? (
          <Link
            href="/signin"
            className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-brand-500 px-4 py-3 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            Back to sign in
          </Link>
        ) : (
          <form action={formAction} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <div className="space-y-5">
              <div>
                <Label htmlFor="new-password">
                  New password <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="new-password"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter a new password"
                  required
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Use at least 10 characters with upper and lower case letters,
                  a number and a symbol.
                </p>
              </div>

              <div>
                <Label htmlFor="confirm-password">
                  Confirm password <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm your new password"
                  required
                />
              </div>

              <Button className="w-full" size="sm" disabled={isPending}>
                {isPending ? "Resetting..." : "Reset password"}
              </Button>
            </div>
          </form>
        )}

        {!state.ok ? (
          <p className="mt-5 text-center text-sm text-gray-700 dark:text-gray-400 sm:text-start">
            Need a new link?{" "}
            <Link
              href="/reset-password"
              className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
            >
              Request another reset
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

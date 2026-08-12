"use client";

import { useActionState } from "react";
import Link from "next/link";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export default function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordResetAction,
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
            Reset password
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter the email address linked to your CRM account and we will send
            a secure reset link if the account is active.
          </p>
        </div>

        <form action={formAction}>
          <div className="space-y-5">
            <ActionStateMessage state={state} />

            <div>
              <Label htmlFor="reset-email">
                Email <span className="text-error-500">*</span>
              </Label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </div>

            <Button className="w-full" size="sm" disabled={isPending}>
              {isPending ? "Sending..." : "Send reset link"}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-sm text-gray-700 dark:text-gray-400 sm:text-start">
          Remembered your password?{" "}
          <Link
            href="/signin"
            className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

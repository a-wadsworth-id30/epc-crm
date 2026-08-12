"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import ActionStateMessage from "@/components/crm-boilerplate/ActionStateMessage";
import { loginAction } from "@/lib/actions/auth";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useActionState, useState } from "react";

export default function SignInForm({ nextPath = "/" }: { nextPath?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState(loginAction, {
    ok: false,
    message: "",
  });
  const signInHref = nextPath
    ? `/signin?next=${encodeURIComponent(nextPath)}`
    : "/signin";

  if (state.twoFactorRequired && state.twoFactorToken) {
    return (
      <div className="flex w-full flex-1 flex-col lg:w-1/2">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
          <div>
            <div className="mb-5 sm:mb-8">
              <h1 className="text-title-sm mb-2 font-semibold text-gray-800 dark:text-white/90 sm:text-title-md">
                Verify your sign in
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter the six-digit code from your authenticator app
                {state.twoFactorUserEmail
                  ? ` for ${state.twoFactorUserEmail}`
                  : ""}
                .
              </p>
            </div>
            <form action={formAction}>
              <input type="hidden" name="next" value={nextPath} />
              <input
                type="hidden"
                name="twoFactorToken"
                value={state.twoFactorToken}
              />
              <div className="space-y-6">
                <ActionStateMessage state={state} />
                <div>
                  <Label htmlFor="two-factor-code">
                    Verification code <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    id="two-factor-code"
                    name="twoFactorCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="123456"
                    required
                  />
                </div>
                <div className="space-y-3">
                  <Button className="w-full" size="sm" disabled={isPending}>
                    {isPending ? "Verifying..." : "Verify and sign in"}
                  </Button>
                  <Link
                    href={signInHref}
                    className="block text-center text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Use a different account
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign in
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your CRM credentials to continue.
            </p>
          </div>
          <div>
            <form action={formAction}>
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-6">
                <ActionStateMessage state={state} />
                <div>
                  <Label htmlFor="email">
                    Email <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input id="email" name="email" type="email" autoComplete="email" placeholder="admin@example.com" required />
                </div>
                <div>
                  <Label htmlFor="password">
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Link
                    href="/reset-password"
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div>
                  <Button className="w-full" size="sm" disabled={isPending}>
                    {isPending ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
